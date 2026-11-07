import "server-only";
import type Decimal from "decimal.js";
import { D, toD } from "@/lib/decimal";
import { maxApplicable } from "@/lib/token-rules";
import { validCommission } from "@/lib/price-rules";
import { db, type Tx } from "./db";
import { resetMemberDone } from "./carts/member-done";
import { CartError } from "./carts/errors";
import { lockCart, withCartTransaction } from "./carts/locks";
import { lockLedgerUsers, withOrderTransaction } from "./orders/locks";
import type { TokenKind } from "@/generated/prisma/client";
export class TokenError extends CartError {}
class MovedLine extends Error {}
function positiveAmount(value: string): D {
  if (!validCommission(value) || new D(value).lte(0))
    throw new TokenError("Enter a positive token amount with at most two decimals");
  return new D(value);
}
export async function tokenBalance(userId: string, tx: Tx = db): Promise<D> {
  const result = await tx.tokenEntry.aggregate({ where: { userId }, _sum: { amount: true } });
  return result._sum.amount === null ? new D(0) : toD(result._sum.amount);
}
const POSITIVE_KINDS: readonly TokenKind[] = [
  "CANCELLATION",
  "RETURN",
  "RELEASE",
  "LATE_PAYMENT",
  "ORDER_CANCEL",
  "AGENT_FEE",
  "COURIER_REPAY",
  "MISSING_ITEM",
  "DEPOSIT_RETURN",
  "TRANSFER_IN",
];
const NEGATIVE_KINDS: readonly TokenKind[] = ["HOLD", "TRANSFER_OUT"];
export type TokenPost = {
  userId: string;
  amount: D;
  kind: TokenKind;
  eventKey: string;
  note: string;
  cartLineId?: string;
  orderId?: string;
  orderLineId?: string;
  returnId?: string;
  counterpartyId?: string;
};
/** Caller is inside a transaction that already holds any earlier locks in the global order.
 * post locks the ledger user row, deduplicates by eventKey and refuses an overdraft.
 */
export async function post(tx: Tx, e: TokenPost): Promise<"created" | "exists"> {
  const amount = new D(e.amount);
  const signOk =
    e.kind === "SPEND"
      ? amount.isZero()
      : POSITIVE_KINDS.includes(e.kind)
        ? amount.gt(0)
        : NEGATIVE_KINDS.includes(e.kind) && amount.lt(0);
  if (!amount.isFinite() || amount.decimalPlaces() > 2 || !validCommission(amount.abs()) || !signOk)
    throw new TokenError("Invalid token amount");
  if (!e.eventKey || e.eventKey.length > 200 || !e.note.trim())
    throw new TokenError("A token entry needs an event and a reason");
  await lockLedgerUsers(tx, [e.userId]);
  const existing = await tx.tokenEntry.findUnique({ where: { eventKey: e.eventKey } });
  if (existing) {
    if (existing.userId !== e.userId || !toD(existing.amount).eq(amount))
      throw new TokenError("Token event does not match its recorded value");
    return "exists";
  }
  if (amount.lt(0) && (await tokenBalance(e.userId, tx)).plus(amount).lt(0))
    throw new TokenError("Not enough tokens");
  await tx.tokenEntry.create({
    data: {
      userId: e.userId,
      amount: amount.toFixed(2),
      kind: e.kind,
      eventKey: e.eventKey,
      note: e.note,
      cartLineId: e.cartLineId,
      orderId: e.orderId,
      orderLineId: e.orderLineId,
      returnId: e.returnId,
      counterpartyId: e.counterpartyId,
    },
  });
  return "created";
}
/** Token holders are buyers and agents. Factory accounts, factory staff, admins and packers hold none. */
export async function assertTokenHolder(tx: Tx, userId: string): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { role: true, factoryId: true, locked: true },
  });
  if (!user || !["CUSTOMER", "AGENT"].includes(user.role) || user.factoryId || user.locked)
    throw new TokenError("This account cannot hold tokens");
}
/** Lock order: both user advisories (sorted) -> both ledger User rows (sorted). */
export async function transferTokens(
  fromId: string,
  toPhoneOrEmail: string,
  amount: string,
  requestKey: string,
): Promise<void> {
  const value = positiveAmount(amount);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(requestKey)) throw new TokenError("Invalid token request");
  const target = toPhoneOrEmail.trim();
  if (!target) throw new TokenError("No account with that phone or email");
  const to = await db.user.findFirst({
    where: { OR: [{ phone: target }, { email: { equals: target, mode: "insensitive" } }] },
    select: { id: true },
  });
  if (!to) throw new TokenError("No account with that phone or email");
  if (to.id === fromId) throw new TokenError("You cannot send tokens to yourself");
  const outKey = `xfer:${requestKey}:out`,
    inKey = `xfer:${requestKey}:in`;
  await withOrderTransaction([fromId, to.id], [], async (tx) => {
    await lockLedgerUsers(tx, [fromId, to.id]);
    const previous = await tx.tokenEntry.findMany({ where: { eventKey: { in: [outKey, inKey] } } });
    if (previous.length) {
      const out = previous.find((p) => p.eventKey === outKey);
      const into = previous.find((p) => p.eventKey === inKey);
      if (
        !out ||
        !into ||
        out.userId !== fromId ||
        into.userId !== to.id ||
        !toD(out.amount).eq(value.neg())
      )
        throw new TokenError("Token request has already been used with another transfer");
      return;
    }
    await assertTokenHolder(tx, fromId);
    await assertTokenHolder(tx, to.id);
    if ((await tokenBalance(fromId, tx)).lt(value)) throw new TokenError("Not enough tokens");
    await post(tx, {
      userId: fromId,
      amount: value.neg(),
      kind: "TRANSFER_OUT",
      eventKey: outKey,
      note: "Tokens sent",
      counterpartyId: to.id,
    });
    await post(tx, {
      userId: to.id,
      amount: value,
      kind: "TRANSFER_IN",
      eventKey: inKey,
      note: "Tokens received",
      counterpartyId: fromId,
    });
  });
}
export async function credit(
  tx: Tx,
  userId: string,
  amount: D,
  kind: "CANCELLATION" | "RETURN",
  ref: { cartLineId?: string; returnId?: string },
  note: string,
): Promise<void> {
  if (!validCommission(amount) || amount.lte(0) || !["CANCELLATION", "RETURN"].includes(kind))
    throw new TokenError("Invalid token credit");
  const reference = kind === "RETURN" ? ref.returnId : ref.cartLineId;
  if (!reference || reference.length > 200 || !note.trim())
    throw new TokenError("A token credit needs a reference and reason");
  await post(tx, { userId, amount, kind, eventKey: `credit:${kind}:${reference}`, note, ...ref });
}
/** Lock order everywhere: existing per-user advisory locks -> cart rows -> ledger User rows.
 * withCartTransaction sorts all participants/cart ids and retries changed membership snapshots.
 * The optional request key deduplicates a retried UI submission; a new key is a new hold event.
 */
export async function applyTokens(
  userId: string,
  cartLineId: string,
  amount: string,
  requestKey?: string,
): Promise<void> {
  const value = positiveAmount(amount);
  if (requestKey !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(requestKey))
    throw new TokenError("Invalid token request");
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = await db.cartLine.findUnique({
      where: { id: cartLineId },
      select: { cartId: true },
    });
    if (!before) throw new TokenError("Cart line not found");
    try {
      await withCartTransaction([before.cartId], [userId], async (tx) => {
        const cart = await lockCart(tx, before.cartId);
        const line = await tx.cartLine.findUnique({ where: { id: cartLineId } });
        if (!line) throw new TokenError("Cart line not found");
        if (line.cartId !== cart.id) throw new MovedLine();
        if (line.userId !== userId) throw new TokenError("Apply tokens only to your own item");
        if (!["OPEN", "READY"].includes(cart.status) || cart.expiresAt <= new Date())
          throw new TokenError("This cart can no longer use tokens");
        if (!(await tx.cartMember.count({ where: { cartId: cart.id, userId } })))
          throw new TokenError("Join the cart first");
        await lockLedgerUsers(tx, [userId]);
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { role: true, locked: true },
        });
        if (!user || user.role !== "CUSTOMER" || user.locked)
          throw new TokenError("Only shoppers can apply tokens");
        const eventKey = `hold:${line.id}:${requestKey === undefined ? `version:${line.tokenVersion}` : `request:${requestKey}`}`;
        const previous = await tx.tokenEntry.findUnique({ where: { eventKey } });
        if (previous) {
          if (previous.userId !== userId || !toD(previous.amount).eq(value.neg()))
            throw new TokenError("Token request has already been used with another amount");
          return;
        }
        const available = await tokenBalance(userId, tx);
        const limit = maxApplicable(
          available,
          toD(line.unitPrice).times(line.qty),
          toD(line.tokensApplied),
        );
        if (value.gt(limit))
          throw new TokenError("Tokens exceed your balance or this item's remaining value");
        const applied = toD(line.tokensApplied).plus(value);
        if (!validCommission(applied)) throw new TokenError("Token amount is too large");
        await tx.tokenEntry.create({
          data: {
            userId,
            amount: value.neg().toFixed(2),
            kind: "HOLD",
            cartLineId: line.id,
            eventKey,
            note: "Tokens applied to item",
          },
        });
        await resetMemberDone(tx, cart.id, userId);
        await tx.cartLine.update({
          where: { id: line.id },
          data: { tokensApplied: applied.toFixed(2), tokenVersion: { increment: 1 } },
        });
      });
      return;
    } catch (error) {
      if (!(error instanceof MovedLine)) throw error;
    }
  }
  throw new TokenError("The item moved to another cart. Try again.");
}
/** Caller holds participant advisories and the cart row. keepApplied releases only excess on a reduction. */
export async function releaseLineTokens(
  tx: Tx,
  cartLineId: string,
  keepApplied: Decimal.Value = "0",
): Promise<void> {
  const line = await tx.cartLine.findUnique({
    where: { id: cartLineId },
    include: { cart: { select: { status: true } } },
  });
  if (!line || toD(line.tokensApplied).isZero()) return;
  await lockLedgerUsers(tx, [line.userId]);
  if (await tx.tokenEntry.count({ where: { cartLineId, kind: "SPEND" } })) return;
  if (!["OPEN", "READY", "AWAITING_SLIP", "SLIP_REVIEW"].includes(line.cart.status))
    throw new TokenError("Paid tokens cannot be released");
  const release = D.max(0, toD(line.tokensApplied).minus(D.max(0, new D(keepApplied))));
  if (release.isZero()) return;
  await resetMemberDone(tx, line.cartId, line.userId);
  await tx.tokenEntry.create({
    data: {
      userId: line.userId,
      amount: release.toFixed(2),
      kind: "RELEASE",
      cartLineId,
      eventKey: `release:${line.id}:${line.tokenVersion}`,
      note: "Unused tokens released",
    },
  });
  await tx.cartLine.update({
    where: { id: line.id },
    data: {
      tokensApplied: toD(line.tokensApplied).minus(release).toFixed(2),
      tokenVersion: { increment: 1 },
    },
  });
}
/** Caller holds participant advisories and cart row. SPEND is a zero-delta finalization, not a second debit. */
export async function spendCartTokens(tx: Tx, cartId: string): Promise<void> {
  const cart = await tx.groupCart.findUniqueOrThrow({
    where: { id: cartId },
    select: { status: true },
  });
  if (!["SLIP_REVIEW", "CONFIRMED", "DISPATCHED", "DELIVERED"].includes(cart.status))
    throw new TokenError("The cart has no payment to confirm");
  const lines = await tx.cartLine.findMany({
    where: { cartId, tokensApplied: { gt: "0" } },
    orderBy: [{ userId: "asc" }, { id: "asc" }],
  });
  await lockLedgerUsers(
    tx,
    lines.map((line) => line.userId),
  );
  for (const line of lines)
    await tx.tokenEntry.createMany({
      data: [
        {
          userId: line.userId,
          amount: "0",
          kind: "SPEND",
          cartLineId: line.id,
          eventKey: `spend:${line.id}:${line.tokenVersion}`,
          note: `${line.tokensApplied.toFixed(2)} tokens spent on item`,
        },
      ],
      skipDuplicates: true,
    });
}
