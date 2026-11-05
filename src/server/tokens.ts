import "server-only";
import type Decimal from "decimal.js";
import { D, toD } from "@/lib/decimal";
import { maxApplicable } from "@/lib/token-rules";
import { validCommission } from "@/lib/price-rules";
import { db, type Tx } from "./db";
import { resetMemberDone } from "./carts/member-done";
import { CartError } from "./carts/errors";
import { lockCart, lockLedgerUsers, withCartTransaction } from "./carts/locks";
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
  await lockLedgerUsers(tx, [userId]);
  const eventKey = `credit:${kind}:${reference}`;
  const existing = await tx.tokenEntry.findUnique({ where: { eventKey } });
  if (existing) {
    if (existing.userId !== userId || !toD(existing.amount).eq(amount))
      throw new TokenError("Token event does not match its recorded value");
    return;
  }
  await tx.tokenEntry.createMany({
    data: [{ userId, amount: amount.toFixed(2), kind, ...ref, eventKey, note }],
    skipDuplicates: true,
  });
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
