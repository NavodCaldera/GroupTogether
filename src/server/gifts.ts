import "server-only";
import { canAdminArea } from "@/lib/admin-access";
import { withCartTransaction, lockCart } from "./carts/locks";
import { resetMemberDone } from "./carts/member-done";
import type { Tx } from "./db";
import { db } from "./db";
import { CatalogueError } from "./catalogue";
import { toD } from "@/lib/decimal";
import { notify } from "./notify";
import { appendBrandEvent, flushBrandNotices, communicationActor } from "./brand-communications";

export async function assertBrand(brandId: string) {
  const brand = await db.user.findFirst({
    where: { id: brandId, role: "SELLER", isBrand: true, locked: false },
    select: { id: true, name: true, company: true, website: true },
  });
  if (!brand) throw new CatalogueError("Only premium brands can use this workspace");
  return brand;
}

async function assertAdmin(adminId: string) {
  if (
    !(await db.user.count({
      where: { id: adminId, role: "ADMIN", adminArea: "PREMIUM", locked: false },
    }))
  )
    throw new CatalogueError("Only admins can authorize gifts and payments");
}

/** Caller locks the cart first. No brand charge is created for an unpaid reservation. */
export async function releaseGiftReservations(tx: Tx, cartId: string, recipientId?: string) {
  const released = await tx.giftOrder.findMany({
    where: { cartId, recipientId, status: "RESERVED" },
    select: { recipientId: true },
    distinct: ["recipientId"],
  });
  for (const gift of released) await resetMemberDone(tx, cartId, gift.recipientId);
  await tx.giftOrder.updateMany({
    where: { cartId, recipientId, status: "RESERVED" },
    data: { status: "CANCELLED" },
  });
}

/** Manual eligibility approval while household/threshold policy remains open. One active gift per recipient/cart. */
export async function reserveGift(
  adminId: string,
  cartId: string,
  recipientId: string,
  offerId: string,
  now = new Date(),
) {
  await assertAdmin(adminId);
  return withCartTransaction([cartId], [adminId, recipientId], async (tx) => {
    await lockCart(tx, cartId);
    const cart = await tx.groupCart.findUniqueOrThrow({ where: { id: cartId } });
    if (!["OPEN", "READY"].includes(cart.status) || cart.expiresAt <= now)
      throw new CatalogueError("Gifts can be reserved only in an editable, unexpired basket");
    const member = await tx.cartMember.findUnique({
      where: { cartId_userId: { cartId, userId: recipientId } },
      include: { user: true },
    });
    if (!member || !(await tx.cartLine.count({ where: { cartId, userId: recipientId } })))
      throw new CatalogueError("Choose a basket member with clothing items");
    if (await tx.giftOrder.count({ where: { cartId, recipientId, status: { not: "CANCELLED" } } }))
      throw new CatalogueError("This member already has a gift in this basket");
    await tx.$queryRaw`SELECT 1 FROM "StockOffer" WHERE id = ${offerId} FOR UPDATE`;
    const offer = await tx.stockOffer.findFirst({
      where: {
        id: offerId,
        status: "ACCEPTED",
        paused: false,
        seller: { isBrand: true, locked: false },
      },
    });
    if (!offer?.offerPrice || !offer.actualPrice || !offer.pieces)
      throw new CatalogueError("Choose an approved, active gift product");
    const allocated = await tx.giftOrder.count({
      where: { offerId, status: { not: "CANCELLED" } },
    });
    if (allocated >= offer.pieces) throw new CatalogueError("This gift is out of stock");
    const address = member.address || member.user.address;
    const city = member.city || member.user.city;
    if (!address || !city || !member.user.phone)
      throw new CatalogueError("The recipient needs an address, city and phone");
    await resetMemberDone(tx, cartId, recipientId);
    return tx.giftOrder.create({
      data: {
        offerId,
        cartId,
        recipientId,
        retailValue: offer.actualPrice,
        partnerPrice: offer.offerPrice,
        recipientName: member.user.name,
        phone: member.user.phone,
        address,
        city,
        authorizedById: adminId,
      },
    });
  });
}

export async function cancelReservedGift(actorId: string, giftId: string) {
  const before = await db.giftOrder.findUniqueOrThrow({ where: { id: giftId } });
  await withCartTransaction([before.cartId], [actorId, before.recipientId], async (tx) => {
    const [actor, gift] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: actorId } }),
      tx.giftOrder.findUniqueOrThrow({ where: { id: giftId }, include: { cart: true } }),
    ]);
    if (
      actor.locked ||
      (!canAdminArea(actor, "PREMIUM") &&
        (actor.role !== "CUSTOMER" || actor.id !== gift.recipientId))
    )
      throw new CatalogueError("This gift is not yours to remove");
    if (gift.cartId !== before.cartId)
      throw new CatalogueError("This gift moved to another cart. Try again.");
    await lockCart(tx, before.cartId);
    if (gift.status !== "RESERVED" || !["OPEN", "READY"].includes(gift.cart.status))
      throw new CatalogueError("This gift is already locked for payment");
    await resetMemberDone(tx, gift.cartId, gift.recipientId);
    await tx.giftOrder.update({ where: { id: giftId }, data: { status: "CANCELLED" } });
  });
}

export async function updateGiftAvailability(
  brandId: string,
  offerId: string,
  pieces: number,
  paused: boolean,
) {
  await assertBrand(brandId);
  if (!Number.isInteger(pieces) || pieces < 0 || pieces > 100_000)
    throw new CatalogueError("Enter a quantity from 0 to 100,000");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "StockOffer" WHERE id = ${offerId} FOR UPDATE`;
    const offer = await tx.stockOffer.findFirst({ where: { id: offerId, sellerId: brandId } });
    if (!offer) throw new CatalogueError("Gift product not found");
    const allocated = await tx.giftOrder.count({
      where: { offerId, status: { not: "CANCELLED" } },
    });
    if (pieces < allocated)
      throw new CatalogueError(`Quantity cannot be below ${allocated} allocated gifts`);
    if (
      toD(offer.offerPrice ?? 0)
        .times(pieces)
        .gte("1000000000000")
    )
      throw new CatalogueError("Reduce the campaign quantity");
    await tx.stockOffer.update({
      where: { id: offerId },
      data: {
        pieces,
        paused,
        amount: toD(offer.offerPrice ?? 0)
          .times(pieces)
          .toString(),
      },
    });
    if (offer.pieces !== pieces || offer.paused !== paused)
      await appendBrandEvent(tx, {
        brandId,
        kind: "PRODUCT",
        subjectId: offerId,
        title: offer.name,
        authorId: brandId,
        body: `Campaign availability updated: ${pieces} total gifts. ${paused ? "New reservations paused." : "New reservations enabled for an approved product."}`,
        requestKey: `gift-availability:${offerId}:${crypto.randomUUID()}`,
      });
  });
  await flushBrandNotices().catch(() => {});
}

export async function updateGiftDelivery(
  brandId: string,
  giftId: string,
  event: string,
  courier: string,
  tracking: string,
  issue: string,
) {
  await assertBrand(brandId);
  const recipient = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GiftOrder" WHERE id = ${giftId} FOR UPDATE`;
    const gift = await tx.giftOrder.findFirst({
      where: { id: giftId, offer: { sellerId: brandId } },
    });
    if (!gift?.paidAt)
      throw new CatalogueError("Only paid, authorized gift orders can be fulfilled");
    if (event === "dispatch" && ["READY", "ISSUE"].includes(gift.status)) {
      if (!courier.trim() || !tracking.trim())
        throw new CatalogueError("Enter the courier and tracking reference");
      await tx.giftOrder.update({
        where: { id: giftId },
        data: {
          status: "DISPATCHED",
          courier: courier.trim().slice(0, 100),
          tracking: tracking.trim().slice(0, 200),
          dispatchedAt: new Date(),
          issue: null,
        },
      });
    } else if (event === "deliver" && gift.status === "DISPATCHED") {
      await tx.giftOrder.update({
        where: { id: giftId },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
    } else if (event === "issue" && ["READY", "DISPATCHED"].includes(gift.status)) {
      if (issue.trim().length < 3) throw new CatalogueError("Describe the delivery issue");
      await tx.giftOrder.update({
        where: { id: giftId },
        data: { status: "ISSUE", issue: issue.trim().slice(0, 500) },
      });
    } else throw new CatalogueError("This gift has already moved to another stage");
    await appendBrandEvent(tx, {
      brandId,
      kind: "GIFT",
      subjectId: giftId,
      title: `Gift order G-${giftId.slice(-8).toUpperCase()}`,
      authorId: brandId,
      body:
        event === "dispatch"
          ? `${gift.status === "ISSUE" ? "Delivery issue cleared; redispatched" : "Dispatched"} with ${courier.trim().slice(0, 100)}. Tracking: ${tracking.trim().slice(0, 200)}`
          : event === "deliver"
            ? "Brand marked the gift delivered."
            : `Delivery issue: ${issue.trim().slice(0, 500)}`,
      requestKey: `gift-event:${giftId}:${crypto.randomUUID()}`,
    });
    return { id: gift.recipientId, cartId: gift.cartId };
  });
  const cart = await db.groupCart.findUniqueOrThrow({
    where: { id: recipient.cartId },
    select: { code: true },
  });
  await notify([recipient.id], {
    title:
      event === "dispatch"
        ? "Your gift was dispatched"
        : event === "deliver"
          ? "Your gift was marked delivered"
          : "Gift delivery update",
    body:
      event === "issue"
        ? issue.trim().slice(0, 500)
        : `${courier.trim()} ${tracking.trim()}`.trim(),
    href: `/c/${cart.code}`,
  });
  await flushBrandNotices().catch(() => {});
}

/** Billing is explicitly approved by an admin; no unagreed automatic billing trigger. */
export async function approveGiftBill(adminId: string, giftId: string) {
  await assertAdmin(adminId);
  await db.$transaction(async (tx) => {
    const result = await tx.giftOrder.updateMany({
      where: {
        id: giftId,
        paidAt: { not: null },
        status: { in: ["READY", "DISPATCHED", "DELIVERED"] },
        billApprovedAt: null,
        settlementId: null,
      },
      data: { billApprovedAt: new Date(), billApprovedById: adminId },
    });
    if (!result.count) throw new CatalogueError("This gift bill cannot be approved");
    const gift = await tx.giftOrder.findUniqueOrThrow({
      where: { id: giftId },
      include: { offer: { select: { sellerId: true } } },
    });
    await appendBrandEvent(tx, {
      brandId: gift.offer.sellerId,
      kind: "GIFT",
      subjectId: giftId,
      title: `Gift order G-${giftId.slice(-8).toUpperCase()}`,
      authorId: adminId,
      body: `Gift bill approved for LKR ${gift.partnerPrice}.`,
      requestKey: `gift-bill:${giftId}`,
    });
  });
  await flushBrandNotices().catch(() => {});
}

/** Records an actual external transfer, never initiates one. Explicit bill IDs avoid paying late additions. */
export async function recordGiftSettlement(
  adminId: string,
  brandId: string,
  giftIds: string[],
  reference: string,
) {
  await assertAdmin(adminId);
  await assertBrand(brandId);
  const ids = [...new Set(giftIds)].sort();
  if (!ids.length || reference.trim().length < 3 || reference.length > 200)
    throw new CatalogueError("Choose bills and enter the payment reference");
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GiftOrder" WHERE id = ANY(${ids}) ORDER BY id FOR UPDATE`;
    const gifts = await tx.giftOrder.findMany({
      where: {
        id: { in: ids },
        offer: { sellerId: brandId },
        paidAt: { not: null },
        billApprovedAt: { not: null },
        settlementId: null,
        status: { in: ["READY", "DISPATCHED", "DELIVERED"] },
      },
    });
    if (gifts.length !== ids.length)
      throw new CatalogueError(
        "Some bills are already paid or need review. Refresh and try again.",
      );
    const amount = gifts.reduce((sum, gift) => sum.plus(gift.partnerPrice), toD(0));
    if (amount.gte("1000000000000"))
      throw new CatalogueError("Split this payment into smaller settlements");
    const settlement = await tx.giftSettlement.create({
      data: {
        brandId,
        amount: amount.toString(),
        reference: reference.trim(),
        settledById: adminId,
        paidAt: new Date(),
      },
    });
    await tx.giftOrder.updateMany({
      where: { id: { in: ids } },
      data: { settlementId: settlement.id },
    });
    await appendBrandEvent(tx, {
      brandId,
      kind: "SETTLEMENT",
      subjectId: settlement.id,
      title: settlement.reference,
      authorId: adminId,
      body: `External transfer recorded: LKR ${amount.toFixed(2)} for ${ids.length} gifts. Reference: ${settlement.reference}`,
      requestKey: `gift-settlement:${settlement.id}`,
    });
    return settlement;
  });
  await flushBrandNotices().catch(() => {});
  return result;
}

export async function acknowledgeGift(brandId: string, giftId: string) {
  await assertBrand(brandId);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GiftOrder" WHERE id=${giftId} FOR UPDATE`;
    const gift = await tx.giftOrder.findFirst({
      where: { id: giftId, offer: { sellerId: brandId }, status: "READY", paidAt: { not: null } },
    });
    if (!gift) throw new CatalogueError("Choose a paid gift awaiting dispatch");
    if (gift.acknowledgedAt) return;
    await tx.giftOrder.update({ where: { id: giftId }, data: { acknowledgedAt: new Date() } });
    await appendBrandEvent(tx, {
      brandId,
      kind: "GIFT",
      subjectId: giftId,
      title: `Gift order G-${giftId.slice(-8).toUpperCase()}`,
      authorId: brandId,
      body: "Brand acknowledged this order and its dispatch instruction.",
      requestKey: `gift-ack:${giftId}`,
    });
  });
  await flushBrandNotices().catch(() => {});
}

export async function respondToSettlement(
  actorId: string,
  settlementId: string,
  event: string,
  note: string,
) {
  const actor = await communicationActor(actorId);
  if (
    !["received", "query", "resolve-query"].includes(event) ||
    (event === "resolve-query") !== (actor.role === "ADMIN")
  )
    throw new CatalogueError("This settlement action is not permitted");
  const text = note.trim();
  if (event !== "received" && (text.length < 3 || text.length > 2000))
    throw new CatalogueError("Describe the payment query or resolution");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GiftSettlement" WHERE id=${settlementId} FOR UPDATE`;
    const settlement = await tx.giftSettlement.findFirst({
      where: { id: settlementId, ...(actor.role === "ADMIN" ? {} : { brandId: actorId }) },
    });
    if (!settlement) throw new CatalogueError("Settlement not found");
    if (event === "received" && settlement.receivedAt && !settlement.queryOpen) return;
    if (event === "resolve-query" && !settlement.queryOpen)
      throw new CatalogueError("There is no open payment query");
    await tx.giftSettlement.update({
      where: { id: settlementId },
      data:
        event === "received"
          ? { receivedAt: settlement.receivedAt ?? new Date(), queryOpen: false }
          : { queryOpen: event === "query" },
    });
    const message = await appendBrandEvent(tx, {
      brandId: settlement.brandId,
      kind: "SETTLEMENT",
      subjectId: settlementId,
      title: settlement.reference,
      authorId: actorId,
      body:
        event === "received"
          ? "Brand confirmed receipt of payment."
          : event === "query"
            ? `Payment query raised: ${text}`
            : `Admin resolved payment query: ${text}`,
      requestKey: `settlement-response:${settlementId}:${crypto.randomUUID()}`,
    });
    if (event === "query")
      await tx.brandConversation.update({
        where: { id: message.conversationId },
        data: { lastHumanSide: "BRAND", resolved: false },
      });
  });
  await flushBrandNotices().catch(() => {});
}

export async function brandDashboard(brandId: string) {
  const brand = await assertBrand(brandId);
  const [offers, gifts, settlements] = await Promise.all([
    db.stockOffer.findMany({
      where: { sellerId: brandId },
      orderBy: { createdAt: "desc" },
      include: { gifts: { select: { status: true } }, revisions: { orderBy: { version: "desc" } } },
    }),
    // Unpaid recipients and basket details never leave the data layer for a brand.
    db.giftOrder.findMany({
      where: { offer: { sellerId: brandId }, paidAt: { not: null } },
      select: {
        id: true,
        retailValue: true,
        partnerPrice: true,
        recipientName: true,
        phone: true,
        address: true,
        city: true,
        status: true,
        paidAt: true,
        acknowledgedAt: true,
        dispatchedAt: true,
        deliveredAt: true,
        createdAt: true,
        courier: true,
        tracking: true,
        issue: true,
        billApprovedAt: true,
        settlementId: true,
        offer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.giftSettlement.findMany({
      where: { brandId },
      include: { _count: { select: { gifts: true } } },
      orderBy: { paidAt: "desc" },
    }),
  ]);
  return {
    brand,
    offers: offers.map(({ gifts, ...offer }) => ({
      ...offer,
      reserved: gifts.filter((g) => g.status === "RESERVED").length,
      allocated: gifts.filter((g) => g.status !== "CANCELLED").length,
      available: Math.max(
        0,
        (offer.pieces ?? 0) - gifts.filter((g) => g.status !== "CANCELLED").length,
      ),
    })),
    gifts,
    settlements,
  };
}
