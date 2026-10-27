import "server-only";
import { addHours } from "@/lib/cart-rules";
import { formatLKR } from "@/lib/format";
import { db } from "../db";
import { notify, notifyRole } from "../notify";
import { getSettings } from "../settings";
import { SLIP_TYPES, checkUpload, saveUpload } from "../storage";
import { CartError } from "./service";
import { appendBrandEvent, flushBrandNotices } from "../brand-communications";

/**
 * The owner's one bank slip for the whole cart. There are no refunds: stock is locked from the
 * moment items are added, so an approved slip is always for goods we have.
 */
export async function uploadSlip(
  ownerId: string,
  cartId: string,
  file: File | null,
  now = new Date(),
) {
  checkUpload(file, SLIP_TYPES, "bank slip");
  // Check before storing the file, then again under the lock.
  const before = await db.groupCart.findUnique({ where: { id: cartId } });
  if (!before || before.ownerId !== ownerId) throw new CartError("Only the cart owner pays");
  if (before.status !== "AWAITING_SLIP") throw new CartError("This cart isn't waiting for a slip");
  const saved = await saveUpload(file!, `slips/${cartId}`, SLIP_TYPES);

  const cart = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${cartId} FOR UPDATE`;
    const cart = await tx.groupCart.findUniqueOrThrow({ where: { id: cartId } });
    if (cart.status !== "AWAITING_SLIP") throw new CartError("This cart isn't waiting for a slip");
    if (cart.slipDueAt && cart.slipDueAt <= now)
      throw new CartError("The 2-hour payment window has closed");
    await tx.paymentSlip.create({
      data: { cartId, uploaderId: ownerId, amount: cart.total, ...saved },
    });
    return tx.groupCart.update({ where: { id: cartId }, data: { status: "SLIP_REVIEW" } });
  });

  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await notify(
    admins.map((a) => a.id),
    {
      title: "Bank slip to review",
      body: `Cart ${cart.code}: ${formatLKR(cart.total)}`,
      href: "/admin/slips",
    },
  );
}

async function lockedSlip(slipId: string) {
  const slip = await db.paymentSlip.findUnique({ where: { id: slipId } });
  if (!slip) throw new CartError("Slip not found");
  return slip;
}

/** SLIP_REVIEW → CONFIRMED: the locked stock becomes a sale. */
export async function approveSlip(adminId: string, slipId: string, now = new Date()) {
  const slip = await lockedSlip(slipId);
  const cart = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${slip.cartId} FOR UPDATE`;
    const cart = await tx.groupCart.findUniqueOrThrow({ where: { id: slip.cartId } });
    const fresh = await tx.paymentSlip.findUniqueOrThrow({ where: { id: slipId } });
    if (fresh.status !== "PENDING" || cart.status !== "SLIP_REVIEW")
      throw new CartError("This slip has already been reviewed");
    await tx.paymentSlip.update({
      where: { id: slipId },
      data: { status: "APPROVED", reviewerId: adminId, reviewedAt: now },
    });
    const lines = await tx.cartLine.findMany({ where: { cartId: cart.id } });
    await tx.giftOrder.updateMany({
      where: { cartId: cart.id, status: "RESERVED" },
      data: { status: "READY", paidAt: now },
    });
    const gifts = await tx.giftOrder.findMany({
      where: { cartId: cart.id, status: "READY" },
      include: { offer: { select: { sellerId: true, name: true } } },
    });
    for (const gift of gifts)
      await appendBrandEvent(tx, {
        brandId: gift.offer.sellerId,
        kind: "GIFT",
        subjectId: gift.id,
        title: `${gift.offer.name} · G-${gift.id.slice(-8).toUpperCase()}`,
        authorId: adminId,
        body: "Basket payment approved. This gift is ready for the brand to acknowledge and dispatch.",
        requestKey: `gift-payment:${gift.id}`,
      });
    for (const l of lines) {
      await tx.variant.update({
        where: { id: l.variantId },
        data: { reserved: { decrement: l.qty }, sold: { increment: l.qty } },
      });
    }
    return tx.groupCart.update({
      where: { id: cart.id },
      data: { status: "CONFIRMED", confirmedAt: now },
    });
  });
  const members = await db.cartMember.findMany({
    where: { cartId: cart.id },
    select: { userId: true },
  });
  await notify(
    members.map((m) => m.userId),
    {
      title: "Group order confirmed",
      body: `Payment for "${cart.name || cart.code}" is confirmed. We'll send it by PickMe to the cart owner. The owner pays the delivery fee to the driver.`,
      href: `/c/${cart.code}`,
    },
  );
  await notifyRole("PACKER", {
    title: "New order to pack",
    body: `Cart ${cart.code} is paid. One of you checks and gathers it, someone else rechecks and packs it.`,
    href: `/packing/${cart.code}`,
  });
  await flushBrandNotices().catch(() => {});
}

/** SLIP_REVIEW → AWAITING_SLIP with a fresh payment window, so the owner can upload again. */
export async function rejectSlip(adminId: string, slipId: string, note: string, now = new Date()) {
  const reason = note.trim();
  if (reason.length < 3) throw new CartError("Say why the slip was rejected");
  const slip = await lockedSlip(slipId);
  const settings = await getSettings();
  const cart = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${slip.cartId} FOR UPDATE`;
    const cart = await tx.groupCart.findUniqueOrThrow({ where: { id: slip.cartId } });
    const fresh = await tx.paymentSlip.findUniqueOrThrow({ where: { id: slipId } });
    if (fresh.status !== "PENDING" || cart.status !== "SLIP_REVIEW")
      throw new CartError("This slip has already been reviewed");
    await tx.paymentSlip.update({
      where: { id: slipId },
      data: { status: "REJECTED", reviewNote: reason, reviewerId: adminId, reviewedAt: now },
    });
    return tx.groupCart.update({
      where: { id: cart.id },
      data: { status: "AWAITING_SLIP", slipDueAt: addHours(now, settings.slipWindowHours) },
    });
  });
  await notify([cart.ownerId], {
    title: "Your bank slip was not accepted",
    body: `${reason}. Please upload a new slip within ${settings.slipWindowHours} hours or the order will be cancelled.`,
    href: `/c/${cart.code}/pay`,
  });
}
