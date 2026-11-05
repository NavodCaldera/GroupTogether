import "server-only";
import { assertAdminArea } from "../auth/service";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Location } from "@/lib/location";
import type { CartStatus, GroupCart, Role } from "@/generated/prisma/client";
import {
  CANCELLABLE,
  addHours,
  amountDue,
  cartTotal,
  isEditable,
  mergeBlockReason,
  meetsMinimum,
  newCartCode,
  overdue,
  statusAfterChange,
} from "@/lib/cart-rules";
import { formatLKR } from "@/lib/format";
import { toD } from "@/lib/decimal";
import { phoneSchema } from "../auth/service";
import { db, type Tx } from "../db";
import { factoryConflict, factoryFulfilment } from "@/lib/fulfilment";
import { reduceDueLots } from "../lots";
import { type Notice, notify } from "../notify";
import { getSettings } from "../settings";
import { releaseGiftReservations } from "../gifts";

import { canSellIn, remindAgreements, sellingFactoryWhere } from "../agreements";

import { confirmPaidCart, notifyCartConfirmed } from "./confirmation";
import { doneProgress, resetMemberDone } from "./member-done";
import { CartError } from "./errors";
export { CartError } from "./errors";
import { releaseLineTokens } from "../tokens";
import { lockCart, lockLedgerUsers, withCartTransaction } from "./locks";

function assertEditable(cart: GroupCart, now: Date) {
  if (overdue(cart, now) === "EXPIRE") throw new CartError("This cart has expired");
  if (!isEditable(cart.status))
    throw new CartError("The owner has accepted this cart, so it can't be changed");
}

/**
 * A buyer can own or be in only one active cart at a time. Takes a per-user lock so two requests
 * can't both pass the check. Pass `cartId` to allow the cart they are already in.
 * Only shoppers use carts: sellers, packing staff and admins are refused (rule 11).
 */
async function assertOneCart(tx: Tx, userId: string, now: Date, cartId?: string) {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${userId}))) AS l`;
  const me = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (me?.role !== "CUSTOMER") throw new CartError("Only shoppers can use carts");
  const other = await tx.groupCart.findFirst({
    where: {
      id: cartId ? { not: cartId } : undefined,
      members: { some: { userId } },
      OR: [
        { status: { in: ["OPEN", "READY"] }, expiresAt: { gt: now } },
        { status: "AWAITING_SLIP", slipDueAt: { gt: now } },
        { status: "SLIP_REVIEW" },
      ],
    },
    select: { name: true, code: true },
  });
  if (other)
    throw new CartError(
      `You already have an active cart (${other.name || other.code}). Finish it, leave it or cancel it before starting or joining another.`,
    );
}

async function memberIds(tx: Tx, cartId: string) {
  const rows = await tx.cartMember.findMany({ where: { cartId }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

/** Recomputes the cart total from its lines and moves it OPEN ⇄ READY. */
async function recompute(tx: Tx, cart: GroupCart, now: Date) {
  const lines = await tx.cartLine.findMany({
    where: { cartId: cart.id },
    select: { qty: true, unitPrice: true },
  });
  const total = cartTotal(lines);
  const next = statusAfterChange(cart.status, total, toD(cart.minOrderValue));
  await tx.groupCart.update({
    where: { id: cart.id },
    data: {
      total: total.toFixed(2),
      status: next.status,
      readyAt: next.status === "READY" ? (cart.readyAt ?? now) : null,
    },
  });
  return { total, ...next };
}

function readyNotice(cart: GroupCart): Notice {
  return {
    title: `Your group cart reached ${formatLKR(cart.minOrderValue)}`,
    body:
      `"${cart.name || cart.code}" has reached the minimum order. ` +
      `The cart owner can now accept the order and pay for the whole cart by bank transfer.`,
    href: `/c/${cart.code}`,
  };
}

// ─── Create / join ────────────────────────────────────────────────────────

export const createCartSchema = z.object({
  name: z.string().trim().max(60).optional().default(""),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
});

export async function createCart(ownerId: string, input: z.input<typeof createCartSchema>) {
  const { name: given, visibility } = createCartSchema.parse(input);
  const settings = await getSettings();
  const now = new Date();
  return db.$transaction(async (tx) => {
    await assertOneCart(tx, ownerId, now);
    const where = await profileLocation(tx, ownerId);
    // Carts are named after their owner ("Navod Caldera's cart"); buyers don't choose a name.
    const owner = await tx.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { name: true },
    });
    return tx.groupCart.create({
      data: {
        code: newCartCode(randomBytes),
        name: given || `${owner.name}'s cart`,
        ownerId,
        visibility,
        minOrderValue: settings.minOrderValue,
        expiresAt: addHours(now, settings.cartLifetimeHours),
        members: { create: { userId: ownerId, ...where } },
      },
    });
  });
}

/** The address and pin saved on a user's profile, copied onto each cart they join. */
async function profileLocation(tx: Tx, userId: string) {
  const u = await tx.user.findUnique({
    where: { id: userId },
    select: { address: true, city: true, lat: true, lng: true },
  });
  return {
    address: u?.address ?? null,
    city: u?.city ?? null,
    lat: u?.lat ?? null,
    lng: u?.lng ?? null,
  };
}

/**
 * Anyone with the code can join while the cart is editable. Joining twice only refreshes the
 * location. A `location` (address + map pin) is saved on the membership and on the profile.
 */
export async function joinCart(
  userId: string,
  cartId: string,
  location?: Location,
  now = new Date(),
) {
  await withCartTransaction([cartId], [userId], async (tx) => {
    const cart = await lockCart(tx, cartId);
    assertEditable(cart, now);
    await assertOneCart(tx, userId, now, cartId);
    if (location) await tx.user.update({ where: { id: userId }, data: location });
    const where = location ?? (await profileLocation(tx, userId));
    await tx.cartMember.upsert({
      where: { cartId_userId: { cartId, userId } },
      create: { cartId, userId, ...where },
      update: location ?? {},
    });
  });
}

// ─── Lines (stock is locked as soon as it is in a cart) ─────────────────────

/**
 * Sets a member's quantity of a variant (0 removes it), or with `add` adds to it, locking or
 * releasing stock by the difference in the same transaction. Adding to a cart joins it.
 */
export async function setLine(
  userId: string,
  cartId: string,
  variantId: string,
  amount: number,
  { add = false, now = new Date() }: { add?: boolean; now?: Date } = {},
) {
  if (!Number.isInteger(amount) || amount < (add ? 1 : 0) || amount > 99)
    throw new CartError("Choose a quantity of 1–99");
  const result = await withCartTransaction([cartId], [userId], async (tx) => {
    const cart = await lockCart(tx, cartId);
    assertEditable(cart, now);
    await assertOneCart(tx, userId, now, cartId);
    await tx.cartMember.upsert({
      where: { cartId_userId: { cartId, userId } },
      create: { cartId, userId, ...(await profileLocation(tx, userId)) },
      update: {},
    });
    const key = { cartId_userId_variantId: { cartId, userId, variantId } };
    const line = await tx.cartLine.findUnique({ where: key });
    const qty = add ? (line?.qty ?? 0) + amount : amount;
    if (qty > 99) throw new CartError("You can have at most 99 of one item");
    const delta = qty - (line?.qty ?? 0);

    if (delta > 0) {
      const premium = await tx.variant.count({
        where: { id: variantId, product: { seller: { isBrand: true } } },
      });
      if (premium) throw new CartError("Premium brand products are complimentary gifts only");
      const product = await tx.variant.findUnique({
        where: { id: variantId },
        select: { product: { select: { sellerId: true, status: true } } },
      });
      if (product?.product.status === "ARCHIVED") throw new CartError("This product is hidden");
      if (product?.product.sellerId && !(await canSellIn(tx, product.product.sellerId, now)))
        throw new CartError("This factory's agreement does not allow new sales");
      if (!line) await assertSameFactory(tx, cartId, [variantId]);
      // Atomic: the row lock taken by UPDATE re-checks `available` against concurrent carts.
      const locked = await tx.variant.updateMany({
        where: { id: variantId, available: { gte: delta } },
        data: { available: { decrement: delta }, reserved: { increment: delta } },
      });
      if (locked.count === 0) {
        const v = await tx.variant.findUnique({ where: { id: variantId } });
        throw new CartError(
          !v
            ? "That item no longer exists"
            : v.available === 0
              ? "Sorry, that size just sold out"
              : `Only ${v.available} more available in that size`,
        );
      }
    } else if (delta < 0) {
      await tx.variant.update({
        where: { id: variantId },
        data: { available: { increment: -delta }, reserved: { decrement: -delta } },
      });
    }

    if (line && qty < line.qty)
      await releaseLineTokens(tx, line.id, toD(line.unitPrice).times(qty));
    if (qty === 0) {
      if (line) await tx.cartLine.delete({ where: key });
    } else if (line) {
      await tx.cartLine.update({ where: key, data: { qty } });
    } else {
      const variant = await tx.variant.findUniqueOrThrow({
        where: { id: variantId },
        select: { product: { select: { price: true } } },
      });
      await tx.cartLine.create({
        data: { cartId, userId, variantId, qty, unitPrice: variant.product.price },
      });
    }
    if (delta !== 0) await resetMemberDone(tx, cartId, userId);
    if (delta < 0) await releaseGiftReservations(tx, cartId, userId);
    const after = await recompute(tx, cart, now);
    return { cart, ...after, members: after.becameReady ? await memberIds(tx, cartId) : [] };
  });
  if (result.becameReady) await notify(result.members, readyNotice(result.cart));
  return result;
}

/** One cart, one factory parcel (product owner, 2026-11-03). Throws when the variants mix. */
async function assertSameFactory(tx: Tx, cartId: string, variantIds: string[]) {
  if (!variantIds.length) return;
  const [existing, incoming] = await Promise.all([
    tx.product.findMany({
      where: { variants: { some: { lines: { some: { cartId } } } } },
      select: { sellerId: true },
    }),
    tx.product.findMany({
      where: { variants: { some: { id: { in: variantIds } } } },
      select: { sellerId: true },
    }),
  ]);
  const have = existing.map((p) => p.sellerId);
  for (const p of incoming) {
    const why = factoryConflict(have, p.sellerId);
    if (why) throw new CartError(why);
    have.push(p.sellerId);
  }
}

/**
 * Releases the locked stock of a cart's lines (optionally one member's only). Leaving deletes
 * the lines too; closing a cart keeps them as its history (closed carts hold no stock).
 */
async function releaseLines(
  tx: Tx,
  cartId: string,
  { userId, keep = false }: { userId?: string; keep?: boolean } = {},
) {
  await releaseGiftReservations(tx, cartId, userId);
  const lines = await tx.cartLine.findMany({ where: { cartId, userId } });
  await lockLedgerUsers(
    tx,
    lines.map((l) => l.userId),
  );
  for (const l of lines) {
    await releaseLineTokens(tx, l.id);
    await tx.variant.update({
      where: { id: l.variantId },
      data: { available: { increment: l.qty }, reserved: { decrement: l.qty } },
    });
  }
  if (!keep) await tx.cartLine.deleteMany({ where: { cartId, userId } });
}

export async function leaveCart(userId: string, cartId: string, now = new Date()) {
  await withCartTransaction([cartId], [userId], async (tx) => {
    const cart = await lockCart(tx, cartId);
    if (cart.ownerId === userId)
      throw new CartError("You started this cart. Cancel it instead of leaving.");
    assertEditable(cart, now);
    await releaseLines(tx, cartId, { userId });
    await tx.cartMember.deleteMany({ where: { cartId, userId } });
    await recompute(tx, cart, now);
  });
}

// ─── Owner accepts and pays ───────────────────────────────────────────────

export const acceptSchema = z.object({
  deliveryAddress: z.string().trim().min(5, "Enter the drop-off address").max(300),
  deliveryCity: z.string().trim().min(2, "Enter the city").max(60),
  deliveryPhone: phoneSchema,
});

/**
 * READY -> AWAITING_SLIP for a positive transfer, or CONFIRMED when tokens cover the cart.
 * Both paths freeze edits and snapshot the owner's delivery details.
 */
export async function acceptAndPay(
  ownerId: string,
  cartId: string,
  input: z.input<typeof acceptSchema>,
  now = new Date(),
) {
  const delivery = acceptSchema.parse(input);
  const settings = await getSettings();
  const cart = await withCartTransaction([cartId], [ownerId], async (tx) => {
    const cart = await lockCart(tx, cartId);
    if (cart.ownerId !== ownerId) throw new CartError("Only the cart owner can accept the order");
    assertEditable(cart, now);
    if (cart.status !== "READY" || !meetsMinimum(toD(cart.total), toD(cart.minOrderValue)))
      throw new CartError(`The cart must reach ${formatLKR(cart.minOrderValue)} first`);
    const progress = await doneProgress(tx, cartId, ownerId);
    if (progress.done !== progress.required)
      throw new CartError("Waiting for every member to mark their items done");
    const blocked = await tx.cartLine.count({
      where: {
        cartId,
        variant: {
          product: {
            sellerId: { not: null },
            NOT: { seller: { is: await sellingFactoryWhere(now, tx) } },
          },
        },
      },
    });
    if (blocked) throw new CartError("This factory's agreement does not allow starting payment");
    const pin = await tx.cartMember.findUnique({
      where: { cartId_userId: { cartId, userId: ownerId } },
      select: { lat: true, lng: true },
    });
    const lines = await tx.cartLine.findMany({
      where: { cartId },
      select: { tokensApplied: true },
    });
    const zeroDue = amountDue(
      toD(cart.total),
      lines.map((l) => toD(l.tokensApplied)),
    ).isZero();
    const accepted = await tx.groupCart.update({
      where: { id: cartId },
      data: {
        ...delivery,
        deliveryLat: pin?.lat ?? null,
        deliveryLng: pin?.lng ?? null,
        status: zeroDue ? "READY" : "AWAITING_SLIP",
        acceptedAt: now,
        slipDueAt: zeroDue ? null : addHours(now, settings.slipWindowHours),
      },
    });
    return zeroDue ? confirmPaidCart(tx, cartId, ownerId, now) : accepted;
  });
  if (cart.status === "CONFIRMED") {
    await notifyCartConfirmed(cart);
    return cart;
  }
  const others = (await memberIds(db, cartId)).filter((id) => id !== ownerId);
  await notify(others, {
    title: "Your group order is locked in",
    body: `The owner of "${cart.name || cart.code}" accepted the order and is paying for the whole cart. Settle your share with them directly.`,
    href: `/c/${cart.code}`,
  });
  return cart;
}

// ─── Closing ──────────────────────────────────────────────────────────────

/** Sets a closing status and releases all locked stock. Caller holds the cart lock. */
async function close(tx: Tx, cart: GroupCart, status: CartStatus, reason: string) {
  await releaseLines(tx, cart.id, { keep: true });
  await tx.groupCart.update({ where: { id: cart.id }, data: { status, closedReason: reason } });
}

export async function cancelCart(actor: { id: string; role: Role }, cartId: string, reason = "") {
  if (actor.role === "ADMIN") await assertAdminArea(actor.id, "WAREHOUSE");
  const { cart, members } = await withCartTransaction([cartId], [actor.id], async (tx) => {
    const cart = await lockCart(tx, cartId);
    const isAdmin = actor.role === "ADMIN";
    if (!isAdmin && cart.ownerId !== actor.id) throw new CartError("Only the owner can cancel");
    // The owner can't cancel once a slip is in review: that money is with an admin.
    const allowed: readonly string[] = isAdmin ? CANCELLABLE : ["OPEN", "READY", "AWAITING_SLIP"];
    if (!allowed.includes(cart.status)) throw new CartError("This cart can no longer be cancelled");
    const members = await memberIds(tx, cartId);
    await close(
      tx,
      cart,
      "CANCELLED",
      reason || (isAdmin ? "Cancelled by GroupBasket" : "Cancelled by the owner"),
    );
    return { cart, members };
  });
  await notify(
    members.filter((id) => id !== actor.id),
    {
      title: "A group cart was cancelled",
      body: `"${cart.name || cart.code}" was cancelled${reason ? `: ${reason}` : ""}. Its items are back in stock.`,
      href: `/c/${cart.code}`,
    },
  );
}

/**
 * Expires carts past their 24h lifetime and cancels accepted carts whose owner missed the slip
 * window, releasing their stock. Run by cron and on page loads (cheap when nothing is due).
 * `cartId` limits it to one cart. A full sweep also drops lots past their full-margin days to
 * the reduced price (`reduceDueLots`).
 */
export async function sweep(now = new Date(), cartId?: string) {
  if (!cartId) await remindAgreements(now);
  // No lot price drop while factories ship directly (product owner, 2026-11-03).
  if (!cartId && !factoryFulfilment()) await reduceDueLots(now);
  const due = await db.groupCart.findMany({
    where: {
      id: cartId,
      OR: [
        { status: { in: ["OPEN", "READY"] }, expiresAt: { lte: now } },
        { status: "AWAITING_SLIP", slipDueAt: { lte: now } },
      ],
    },
    select: { id: true },
    take: 100,
  });
  let closed = 0;
  const notices: Promise<unknown>[] = [];
  for (const { id } of due) {
    const done = await withCartTransaction([id], [], async (tx) => {
      const cart = await lockCart(tx, id);
      const what = overdue(cart, now);
      if (!what) return null;
      const members = await memberIds(tx, id);
      if (what === "EXPIRE") {
        await close(tx, cart, "EXPIRED", "Didn't reach the minimum in time");
      } else {
        await close(tx, cart, "CANCELLED", "The bank slip wasn't uploaded in time");
      }
      return { cart, members, what };
    });
    if (!done) continue;
    closed++;
    const name = done.cart.name || done.cart.code;
    notices.push(
      notify(
        done.members,
        done.what === "EXPIRE"
          ? {
              title: "A group cart expired",
              body: `"${name}" didn't reach the minimum in time. Its items are back in stock.`,
              href: `/c/${done.cart.code}`,
            }
          : {
              title: "A group cart was cancelled",
              body: `The bank slip for "${name}" wasn't uploaded in time, so the order was cancelled.`,
              href: `/c/${done.cart.code}`,
            },
      ),
    );
  }
  await Promise.all(notices);
  return { closed };
}

// ─── Merging into a friend's cart (CLAUDE.md rule 13) ─────────────────────

/** The buyer's cart that a merge would move out of: their one active cart. */
async function mergeSource(tx: Tx, userId: string, now: Date) {
  return tx.groupCart.findFirst({
    where: {
      members: { some: { userId } },
      OR: [
        { status: { in: ["OPEN", "READY"] }, expiresAt: { gt: now } },
        { status: "AWAITING_SLIP", slipDueAt: { gt: now } },
        { status: "SLIP_REVIEW" },
      ],
    },
    include: { _count: { select: { members: true } } },
  });
}

/** A buyer already in a cart asks to join another. The other cart's owner must accept. */
export async function requestMerge(userId: string, toCartId: string, now = new Date()) {
  const { request, to } = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${userId}))) AS l`;
    const to = await tx.groupCart.findUnique({ where: { id: toCartId } });
    if (!to) throw new CartError("This cart no longer exists");
    const from = await mergeSource(tx, userId, now);
    if (!from) throw new CartError("You have no active cart to merge. Just join this one.");
    if (from.id === toCartId) throw new CartError("You are already in this cart");
    const why = mergeBlockReason(
      { from: { ...from, memberCount: from._count.members }, to, userId },
      now,
    );
    if (why) throw new CartError(why);
    const pending = await tx.cartMergeRequest.findFirst({ where: { userId, status: "PENDING" } });
    if (pending) throw new CartError("You already have a request waiting. Cancel it first.");
    const request = await tx.cartMergeRequest.create({
      data: { userId, fromCartId: from.id, toCartId },
    });
    return { request, to };
  });
  const who = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
  await notify([to.ownerId], {
    title: `${who.name} wants to join your cart`,
    // The title says it all; Accept / Decline sit right under it on the notifications page.
    body: "",
    href: `/c/${to.code}?request=${request.id}`,
  });
  return request;
}

/**
 * The owner of the target cart accepts: the requester's items move over (their stock stays
 * locked, nothing is released), they join the target, and the cart they leave is deleted, or
 * just loses them when it was someone else's. Both carts are re-checked under their locks.
 */
export async function acceptMerge(ownerId: string, requestId: string, now = new Date()) {
  const first = await db.cartMergeRequest.findUnique({ where: { id: requestId } });
  if (!first || first.status !== "PENDING") throw new CartError("This request is no longer open");
  const ids = [first.fromCartId, first.toCartId].filter((x): x is string => !!x).sort();
  const out = await withCartTransaction(ids, [ownerId, first.userId], async (tx) => {
    for (const id of ids) await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${id} FOR UPDATE`;
    const req = await tx.cartMergeRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (req.status !== "PENDING" || !req.fromCartId)
      throw new CartError("This request is no longer open");
    const [to, from] = await Promise.all([
      tx.groupCart.findUniqueOrThrow({ where: { id: req.toCartId } }),
      tx.groupCart.findUnique({
        where: { id: req.fromCartId },
        include: { _count: { select: { members: true } } },
      }),
    ]);
    if (to.ownerId !== ownerId) throw new CartError("Only the cart owner can accept this");
    const stillIn =
      from &&
      (await tx.cartMember.findUnique({
        where: { cartId_userId: { cartId: from.id, userId: req.userId } },
      }));
    const why =
      !from || !stillIn
        ? "They are no longer in that cart."
        : mergeBlockReason(
            { from: { ...from, memberCount: from._count.members }, to, userId: req.userId },
            now,
          );
    if (why || !from) {
      await tx.cartMergeRequest.update({
        where: { id: requestId },
        data: { status: "CANCELLED", decidedAt: now },
      });
      return { error: why ?? "They are no longer in that cart." } as const;
    }
    const moving = await tx.cartLine.findMany({
      where: { cartId: from.id, userId: req.userId },
      select: { variantId: true },
    });
    await assertSameFactory(
      tx,
      to.id,
      moving.map((l) => l.variantId),
    );
    // Their items move; stock is untouched (it is already locked for them).
    await tx.giftOrder.updateMany({
      where: { cartId: from.id, recipientId: req.userId, status: "RESERVED" },
      data: { cartId: to.id },
    });
    await tx.cartLine.updateMany({
      where: { cartId: from.id, userId: req.userId },
      data: { cartId: to.id },
    });
    await tx.cartMember.upsert({
      where: { cartId_userId: { cartId: to.id, userId: req.userId } },
      create: { cartId: to.id, userId: req.userId },
      update: { doneAt: null },
    });
    // Preserve existing sample shipments when the source cart is deleted or its requester moves.
    // Snapshot destinations and accepted transport remain unchanged.
    await tx.sampleRequest.updateMany({
      where: {
        cartId: from.id,
        ...(from.ownerId === req.userId ? {} : { requesterId: req.userId }),
      },
      data: { cartId: to.id },
    });
    const waiting: string[] = [];
    if (from.ownerId === req.userId) {
      const others = await tx.cartMergeRequest.findMany({
        where: { toCartId: from.id, status: "PENDING" },
        select: { userId: true },
      });
      waiting.push(...others.map((o) => o.userId));
      await tx.groupCart.delete({ where: { id: from.id } });
    } else {
      await tx.cartMember.deleteMany({ where: { cartId: from.id, userId: req.userId } });
      await recompute(tx, from, now);
    }
    await tx.cartMergeRequest.update({
      where: { id: requestId },
      data: { status: "ACCEPTED", decidedAt: now },
    });
    const after = await recompute(tx, to, now);
    return {
      to,
      userId: req.userId,
      waiting,
      sourceName: from.name || from.code,
      becameReady: after.becameReady,
      members: after.becameReady ? await memberIds(tx, to.id) : [],
    } as const;
  });
  if ("error" in out) throw new CartError(`Can't merge: ${out.error}`);
  const toName = out.to.name || out.to.code;
  await notify([out.userId], {
    title: "You joined the cart",
    body: `"${toName}" accepted you. Your items from "${out.sourceName}" are now in it, and you can add more.`,
    href: `/c/${out.to.code}`,
  });
  await notify(out.waiting, {
    title: "That cart is gone",
    body: `"${out.sourceName}" was merged into another cart, so your request to join it was closed.`,
  });
  if (out.becameReady) await notify(out.members, readyNotice(out.to));
  return out.to;
}

async function decideMerge(
  who: { userId: string; asOwner: boolean },
  requestId: string,
  status: "DECLINED" | "CANCELLED",
  now: Date,
) {
  const req = await db.cartMergeRequest.findUnique({
    where: { id: requestId },
    include: { toCart: true },
  });
  if (!req || req.status !== "PENDING") throw new CartError("This request is no longer open");
  if (who.asOwner ? req.toCart.ownerId !== who.userId : req.userId !== who.userId)
    throw new CartError("That request isn't yours to change");
  await db.cartMergeRequest.update({ where: { id: requestId }, data: { status, decidedAt: now } });
  if (who.asOwner)
    await notify([req.userId], {
      title: "Your request was declined",
      body: `The owner of "${req.toCart.name || req.toCart.code}" didn't accept you. Your own cart is unchanged.`,
      href: `/my-carts`,
    });
}

export const declineMerge = (ownerId: string, requestId: string, now = new Date()) =>
  decideMerge({ userId: ownerId, asOwner: true }, requestId, "DECLINED", now);

export const cancelMerge = (userId: string, requestId: string, now = new Date()) =>
  decideMerge({ userId, asOwner: false }, requestId, "CANCELLED", now);

/** The authenticated member changes only their own done flag, under the common cart lock. */
async function changeDone(userId: string, cartId: string, done: boolean, now: Date) {
  const result = await withCartTransaction([cartId], [userId], async (tx) => {
    const cart = await lockCart(tx, cartId);
    assertEditable(cart, now);
    if (cart.ownerId === userId) throw new CartError("The owner finishes the cart instead");
    const member = await tx.cartMember.findUnique({ where: { cartId_userId: { cartId, userId } } });
    if (!member) throw new CartError("Join the cart first");
    const before = await doneProgress(tx, cartId, cart.ownerId);
    if (done ? member.doneAt === null : member.doneAt !== null)
      await tx.cartMember.update({ where: { id: member.id }, data: { doneAt: done ? now : null } });
    const after = await doneProgress(tx, cartId, cart.ownerId);
    return {
      cart,
      becameDone: done && before.done < before.required && after.done === after.required,
    };
  });
  if (result.becameDone)
    await notify([result.cart.ownerId], {
      title: "Everyone is done",
      body: "",
      href: `/c/${result.cart.code}`,
    });
}
export async function markDone(userId: string, cartId: string, now = new Date()) {
  await changeDone(userId, cartId, true, now);
}
export async function undoDone(userId: string, cartId: string, now = new Date()) {
  await changeDone(userId, cartId, false, now);
}
export async function removeMember(
  ownerId: string,
  cartId: string,
  memberId: string,
  now = new Date(),
) {
  const cart = await withCartTransaction([cartId], [ownerId, memberId], async (tx) => {
    const cart = await lockCart(tx, cartId);
    if (cart.ownerId !== ownerId) throw new CartError("Only the owner can remove a member");
    assertEditable(cart, now);
    if (memberId === ownerId) throw new CartError("The owner cannot be removed");
    const member = await tx.cartMember.findUnique({
      where: { cartId_userId: { cartId, userId: memberId } },
    });
    if (!member) throw new CartError("This member is no longer in the cart");
    if (member.doneAt !== null) throw new CartError("This member has marked their items done");
    await releaseLines(tx, cartId, { userId: memberId });
    await tx.cartMember.delete({ where: { id: member.id } });
    await recompute(tx, cart, now);
    return cart;
  });
  await notify([memberId], {
    title: `Removed from ${cart.name || cart.code}`,
    body: "",
    href: `/c/${cart.code}`,
  });
}
