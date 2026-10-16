import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { CartStatus, GroupCart, Role } from "@/generated/prisma/client";
import {
  CANCELLABLE,
  addHours,
  cartTotal,
  isEditable,
  meetsMinimum,
  newCartCode,
  overdue,
  statusAfterChange,
} from "@/lib/cart-rules";
import { formatLKR } from "@/lib/format";
import { toD } from "@/lib/decimal";
import { phoneSchema } from "../auth/service";
import { db, type Tx } from "../db";
import { type Notice, notify } from "../notify";
import { getSettings } from "../settings";

export class CartError extends Error {}

/** Row lock on the cart: every change to a cart's lines or status runs under it. */
async function lockCart(tx: Tx, cartId: string): Promise<GroupCart> {
  await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${cartId} FOR UPDATE`;
  const cart = await tx.groupCart.findUnique({ where: { id: cartId } });
  if (!cart) throw new CartError("This cart no longer exists");
  return cart;
}

function assertEditable(cart: GroupCart, now: Date) {
  if (overdue(cart, now) === "EXPIRE") throw new CartError("This cart has expired");
  if (!isEditable(cart.status))
    throw new CartError("The owner has accepted this cart, so it can't be changed");
}

/**
 * A buyer can own or be in only one active cart at a time. Takes a per-user lock so two requests
 * can't both pass the check. Pass `cartId` to allow the cart they are already in.
 */
async function assertOneCart(tx: Tx, userId: string, now: Date, cartId?: string) {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${userId}))) AS l`;
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
  const { name, visibility } = createCartSchema.parse(input);
  const settings = await getSettings();
  const now = new Date();
  return db.$transaction(async (tx) => {
    await assertOneCart(tx, ownerId, now);
    return tx.groupCart.create({
      data: {
        code: newCartCode(randomBytes),
        name,
        ownerId,
        visibility,
        minOrderValue: settings.minOrderValue,
        expiresAt: addHours(now, settings.cartLifetimeHours),
        members: { create: { userId: ownerId } },
      },
    });
  });
}

/** Anyone with the code can join while the cart is editable. Joining twice is a no-op. */
export async function joinCart(userId: string, cartId: string, now = new Date()) {
  await db.$transaction(async (tx) => {
    const cart = await lockCart(tx, cartId);
    assertEditable(cart, now);
    await assertOneCart(tx, userId, now, cartId);
    await tx.cartMember.upsert({
      where: { cartId_userId: { cartId, userId } },
      create: { cartId, userId },
      update: {},
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
  const result = await db.$transaction(async (tx) => {
    const cart = await lockCart(tx, cartId);
    assertEditable(cart, now);
    await assertOneCart(tx, userId, now, cartId);
    await tx.cartMember.upsert({
      where: { cartId_userId: { cartId, userId } },
      create: { cartId, userId },
      update: {},
    });
    const key = { cartId_userId_variantId: { cartId, userId, variantId } };
    const line = await tx.cartLine.findUnique({ where: key });
    const qty = add ? (line?.qty ?? 0) + amount : amount;
    if (qty > 99) throw new CartError("You can have at most 99 of one item");
    const delta = qty - (line?.qty ?? 0);

    if (delta > 0) {
      // Atomic: the row lock taken by UPDATE re-checks `available` against concurrent carts.
      const locked = await tx.variant.updateMany({
        where: { id: variantId, available: { gte: delta }, product: { status: "LIVE" } },
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
    const after = await recompute(tx, cart, now);
    return { cart, ...after, members: after.becameReady ? await memberIds(tx, cartId) : [] };
  });
  if (result.becameReady) await notify(result.members, readyNotice(result.cart));
  return result;
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
  const lines = await tx.cartLine.findMany({ where: { cartId, userId } });
  for (const l of lines) {
    await tx.variant.update({
      where: { id: l.variantId },
      data: { available: { increment: l.qty }, reserved: { decrement: l.qty } },
    });
  }
  if (!keep) await tx.cartLine.deleteMany({ where: { cartId, userId } });
}

export async function leaveCart(userId: string, cartId: string, now = new Date()) {
  await db.$transaction(async (tx) => {
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
 * READY → AWAITING_SLIP. Freezes the cart (its stock is already locked) and starts the owner's
 * window to pay the whole cart and upload one bank slip.
 */
export async function acceptAndPay(
  ownerId: string,
  cartId: string,
  input: z.input<typeof acceptSchema>,
  now = new Date(),
) {
  const delivery = acceptSchema.parse(input);
  const settings = await getSettings();
  const cart = await db.$transaction(async (tx) => {
    const cart = await lockCart(tx, cartId);
    if (cart.ownerId !== ownerId) throw new CartError("Only the cart owner can accept the order");
    assertEditable(cart, now);
    if (cart.status !== "READY" || !meetsMinimum(toD(cart.total), toD(cart.minOrderValue)))
      throw new CartError(`The cart must reach ${formatLKR(cart.minOrderValue)} first`);
    return tx.groupCart.update({
      where: { id: cartId },
      data: {
        ...delivery,
        status: "AWAITING_SLIP",
        acceptedAt: now,
        slipDueAt: addHours(now, settings.slipWindowHours),
      },
    });
  });
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
  const { cart, members } = await db.$transaction(async (tx) => {
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
      reason || (isAdmin ? "Cancelled by GroupTogether" : "Cancelled by the owner"),
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
 * `cartId` limits it to one cart.
 */
export async function sweep(now = new Date(), cartId?: string) {
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
  for (const { id } of due) {
    const done = await db.$transaction(async (tx) => {
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
    await notify(
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
    );
  }
  return { closed };
}
