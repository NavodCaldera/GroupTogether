import "server-only";
import { isPickupCode } from "@/lib/agent-rules";
import { assertAgent } from "../auth/service";
import { db, type Tx } from "../db";
import { CartError } from "../carts/errors";
import { lockPickupAgent, withOrderTransaction } from "./locks";

export class PickupBlocked extends CartError {}

const MAX_FAILS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export type PickupLine = { id: string; title: string; size: string; colour: string; qty: number };

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
      variant: { select: { size: true, colour: true, product: { select: { title: true } } } },
    },
    orderBy: { id: "asc" },
  });
  return lines
    .filter((l) => l.qty - l.missingQty > 0)
    .map((l) => ({
      id: l.id,
      title: l.variant.product.title,
      size: l.variant.size,
      colour: l.variant.colour,
      qty: l.qty - l.missingQty,
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

/** Marks the given lines collected. All must be in the code's current eligible lines, otherwise
 * nothing changes. The order status stays RECEIVED (no collected status exists).
 */
export async function handOver(
  agentUserId: string,
  code: string,
  lineIds: string[],
  now: Date = new Date(),
): Promise<number> {
  const agent = await requireAgent(agentUserId);
  const ids = [...new Set(lineIds ?? [])];
  if (ids.length === 0) throw new CartError("Choose the items to hand over");

  const first = await buyerOfCode(db, agent.id, code);
  if (!first) throw new CartError("Code not found");
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
    if (!buyer || buyer.buyerId !== first.buyerId) throw new CartError("Code not found");
    const current = (await ordersOf(tx, buyer.buyerId)).map((o) => o.id);
    if (current.length !== locked.length || current.some((id, i) => id !== locked[i]))
      throw new CartError("Busy, try again.");
    const eligible = new Set((await eligibleLines(tx, agent.id, buyer.buyerId)).map((l) => l.id));
    if (ids.some((id) => !eligible.has(id)))
      throw new CartError("Those items cannot be handed over");
    const done = await tx.orderLine.updateMany({
      where: { id: { in: ids }, collectedAt: null },
      data: { collectedAt: now },
    });
    if (done.count !== ids.length) throw new CartError("Those items cannot be handed over");
    return done.count;
  });
}
