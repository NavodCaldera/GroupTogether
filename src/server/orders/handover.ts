import "server-only";
import { isPickupCode } from "@/lib/agent-rules";
import { D, toD } from "@/lib/decimal";
import { assertAgent } from "../auth/service";
import { db, type Tx } from "../db";
import { CartError } from "@/server/errors";
import { lockPickupAgent, withOrderTransaction } from "./locks";

export class PickupBlocked extends CartError {}

const MAX_FAILS = 5;
const WINDOW_MS = 10 * 60 * 1000;

/** `fee` is the cash agent fee for the line, as a 2 dp string. */
export type PickupLine = {
  id: string;
  title: string;
  /** OrderLine.variantLabel, e.g. "M / Navy" */
  label: string;
  qty: number;
  fee: string;
};

/** The agent hands over only once the buyer has paid the cash agent fee (DEC-019). */
export const FEE_NOT_TAKEN = "Take the agent fee first";

/** A LIVE, SUSPENDED or LEAVING agent: a suspended agent still hands over parcels. */
async function requireAgent(agentUserId: string) {
  try {
    return await assertAgent(agentUserId);
  } catch {
    throw new CartError("Not allowed");
  }
}

/** The buyer behind a code at this agent, or null. */
async function buyerOfCode(client: Tx | typeof db, agentId: string, code: string) {
  if (typeof code !== "string" || !isPickupCode(code)) return null;
  const row = await client.pickupCode.findUnique({
    where: { agentId_code: { agentId, code } },
    select: { buyerId: true, buyer: { select: { name: true } } },
  });
  return row ? { buyerId: row.buyerId, buyerName: row.buyer.name } : null;
}

/** Uncollected lines with quantity left, on the buyer's RECEIVED orders at this agent. */
async function eligibleLines(client: Tx | typeof db, agentId: string, buyerId: string) {
  const lines = await client.orderLine.findMany({
    where: {
      collectedAt: null,
      status: "ACTIVE",
      order: { agentId, buyerId, status: "RECEIVED" },
    },
    select: {
      id: true,
      qty: true,
      missingQty: true,
      cashFeeEach: true,
      variantLabel: true,
      variant: { select: { product: { select: { title: true } } } },
    },
    orderBy: { id: "asc" },
  });
  return lines
    .filter((l) => l.qty - l.missingQty > 0)
    .map((l) => ({
      id: l.id,
      title: l.variant.product.title,
      label: l.variantLabel,
      qty: l.qty - l.missingQty,
      fee: toD(l.cashFeeEach)
        .times(l.qty - l.missingQty)
        .toFixed(2),
    }));
}

/** The agent types a buyer's code. Every lookup is recorded; 5 failures in 10 minutes block the
 * agent until the oldest of them is more than 10 minutes old, even for a correct code.
 */
export async function lookupCode(
  agentUserId: string,
  code: string,
  now: Date = new Date(),
): Promise<{ buyerName: string; lines: PickupLine[] } | null> {
  const agent = await requireAgent(agentUserId);
  // One lookup at a time per agent, so parallel wrong codes cannot slip past the throttle.
  return db.$transaction(
    async (tx) => {
      await lockPickupAgent(tx, agent.id);
      const fails = await tx.pickupAttempt.count({
        where: { agentId: agent.id, ok: false, at: { gt: new Date(now.getTime() - WINDOW_MS) } },
      });
      if (fails >= MAX_FAILS) throw new PickupBlocked("Too many wrong codes. Try again later.");
      const buyer = await buyerOfCode(tx, agent.id, code);
      const lines = buyer ? await eligibleLines(tx, agent.id, buyer.buyerId) : [];
      const ok = !!buyer && lines.length > 0;
      await tx.pickupAttempt.create({ data: { agentId: agent.id, ok, at: now } });
      return ok ? { buyerName: buyer.buyerName, lines } : null;
    },
    { maxWait: 10000, timeout: 30000 },
  );
}

/** One answer for an unknown code and for items the code does not cover, so handOver cannot
 * tell which codes exist. */
export const HANDOVER_REFUSED = "Code or items not found";

/** Marks the given lines collected. All must be in the code's current eligible lines, otherwise
 * nothing changes. A wrong code or wrong items count toward the same throttle as lookupCode.
 * The order status stays RECEIVED (no collected status exists). `feeReceived` is the cash agent
 * fee the agent confirms it took for these lines; it must equal what they owe, and is stored on
 * each line.
 */
export async function handOver(
  agentUserId: string,
  code: string,
  lineIds: string[],
  now: Date = new Date(),
  feeReceived: string | null = null,
): Promise<number> {
  const agent = await requireAgent(agentUserId);
  const ids = [...new Set(lineIds ?? [])];
  if (ids.length === 0) throw new CartError("Choose the items to hand over");
  if (feeReceived !== null && !/^\d{1,10}(\.\d{1,2})?$/.test(feeReceived))
    throw new CartError(FEE_NOT_TAKEN);

  // Checked and recorded under the pickup lock in its own transaction, so a refusal is counted.
  const first = await db.$transaction(
    async (tx) => {
      await lockPickupAgent(tx, agent.id);
      const fails = await tx.pickupAttempt.count({
        where: { agentId: agent.id, ok: false, at: { gt: new Date(now.getTime() - WINDOW_MS) } },
      });
      if (fails >= MAX_FAILS) throw new PickupBlocked("Too many wrong codes. Try again later.");
      const buyer = await buyerOfCode(tx, agent.id, code);
      const eligible = buyer
        ? new Set((await eligibleLines(tx, agent.id, buyer.buyerId)).map((l) => l.id))
        : new Set<string>();
      const ok = !!buyer && ids.every((id) => eligible.has(id));
      if (!ok) await tx.pickupAttempt.create({ data: { agentId: agent.id, ok: false, at: now } });
      return ok ? buyer : null;
    },
    { maxWait: 10000, timeout: 30000 },
  );
  if (!first) throw new CartError(HANDOVER_REFUSED);
  const ordersOf = (client: Tx | typeof db, buyerId: string) =>
    client.order.findMany({
      where: { agentId: agent.id, buyerId, status: "RECEIVED" },
      select: { id: true },
      orderBy: { id: "asc" },
    });
  const locked = (await ordersOf(db, first.buyerId)).map((o) => o.id);
  return withOrderTransaction([], locked, async (tx) => {
    // Re-resolve under the Order locks; anything that moved since is refused.
    const buyer = await buyerOfCode(tx, agent.id, code);
    if (!buyer || buyer.buyerId !== first.buyerId) throw new CartError(HANDOVER_REFUSED);
    const current = (await ordersOf(tx, buyer.buyerId)).map((o) => o.id);
    if (current.length !== locked.length || current.some((id, i) => id !== locked[i]))
      throw new CartError("Busy, try again.");
    const eligible = new Map(
      (await eligibleLines(tx, agent.id, buyer.buyerId)).map((l) => [l.id, l.fee]),
    );
    if (ids.some((id) => !eligible.has(id))) throw new CartError(HANDOVER_REFUSED);
    const owed = ids.reduce((sum, id) => sum.plus(eligible.get(id)!), new D(0));
    if (owed.gt(0) && (feeReceived === null || !new D(feeReceived).eq(owed)))
      throw new CartError(FEE_NOT_TAKEN);
    let count = 0;
    for (const id of [...ids].sort()) {
      const done = await tx.orderLine.updateMany({
        where: { id, collectedAt: null },
        data: { collectedAt: now, cashFeePaid: eligible.get(id)! },
      });
      count += done.count;
    }
    if (count !== ids.length) throw new CartError(HANDOVER_REFUSED);
    return count;
  });
}
