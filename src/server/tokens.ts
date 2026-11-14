import "server-only";
import { D, toD } from "@/lib/decimal";
import { validCommission } from "@/lib/price-rules";
import { db, type Tx } from "./db";
import { CartError } from "@/server/errors";
import { lockLedgerUsers, withOrderTransaction } from "./orders/locks";
import type { TokenKind } from "@/generated/prisma/client";
export class TokenError extends CartError {}
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
const NEGATIVE_KINDS: readonly TokenKind[] = ["HOLD", "TRANSFER_OUT", "FEE_CLAWBACK"];
type TokenPost = {
  userId: string;
  amount: D;
  kind: TokenKind;
  eventKey: string;
  note: string;
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
    if (
      existing.userId !== e.userId ||
      existing.kind !== e.kind ||
      !toD(existing.amount).eq(amount)
    )
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
  const outKey = `xfer:${fromId}:${requestKey}:out`,
    inKey = `xfer:${fromId}:${requestKey}:in`;
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
        !toD(out.amount).eq(value.neg()) ||
        !toD(into.amount).eq(value)
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
  kind: "RETURN",
  ref: { returnId: string },
  note: string,
): Promise<void> {
  if (!validCommission(amount) || amount.lte(0) || kind !== "RETURN")
    throw new TokenError("Invalid token credit");
  const reference = ref.returnId;
  if (!reference || reference.length > 200 || !note.trim())
    throw new TokenError("A token credit needs a reference and reason");
  await post(tx, { userId, amount, kind, eventKey: `credit:${kind}:${reference}`, note, ...ref });
}
