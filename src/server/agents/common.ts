import "server-only";
import type { Agent, AgentStatus } from "@/generated/prisma/client";
import { AGENTS_AREA } from "@/lib/admin-access";
import { db, type Tx } from "../db";
import { assertAdminArea } from "../auth/service";
import { CartError } from "@/server/errors";
import { lockBasket } from "../orders/baskets";
import { lockBasketSlot, withOrderTransaction } from "../orders/locks";

export class AgentError extends CartError {}

const NOTE_MAX = 500;
/** Statuses whose pin still serves buyers, so a new agent may not open within the gap. */
export const ACTIVE_STATUSES: AgentStatus[] = ["LIVE", "APPROVED", "SUSPENDED", "LEAVING"];

export async function requireAgentsAdmin(adminId: string) {
  try {
    await assertAdminArea(adminId, AGENTS_AREA);
  } catch {
    throw new AgentError("Not allowed");
  }
}

/** The Agent row for an agent's own login. */
export async function agentOfUser(agentUserId: string) {
  const agent = await db.agent.findUnique({
    where: { userId: agentUserId },
    select: { id: true, userId: true, user: { select: { locked: true } } },
  });
  if (!agent || agent.user.locked) throw new AgentError("Not allowed");
  return agent;
}

/** Every write to an agent's status runs here. Lock order: the agent user's advisory -> Agent
 * row (FOR NO KEY UPDATE) -> basket advisories -> Basket rows -> ledger.
 * FOR NO KEY UPDATE conflicts with the FOR SHARE that checkout, markOrdersPaid and toHandover
 * take before any basket advisory, so a status change and a new basket or return serialize. It
 * does not block the FOR KEY SHARE Postgres takes when a row referencing the agent is inserted
 * (a PickupCode in markBasketReceived, under basket:<agentId>:<factoryId>), so there is no cycle
 * with lockOpenBaskets waiting for that basket advisory.
 */
export async function withAgent<T>(
  agentId: string,
  work: (tx: Tx, agent: Agent) => Promise<T>,
  extraAdvisories: string[] = [],
): Promise<T> {
  const found = await db.agent.findUnique({ where: { id: agentId }, select: { userId: true } });
  if (!found) throw new AgentError("Agent not found");
  return withOrderTransaction([found.userId, ...extraAdvisories], [], async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Agent" WHERE id = ${agentId} FOR NO KEY UPDATE`;
    const agent = await tx.agent.findUniqueOrThrow({ where: { id: agentId } });
    return work(tx, agent);
  });
}

/** Caller holds the Agent row. Locks every OPEN basket of the agent that holds a PAID order
 * (basket advisories in factory order, then the Basket row). A basket with no PAID order (its
 * only order was cancelled) stays OPEN and empty: cancelled orders still reference it, so it is
 * not deleted, and there is nothing for the factory to ship. No new OPEN basket can appear while
 * the Agent row is held.
 */
export async function lockOpenBaskets(tx: Tx, agentId: string, now: Date): Promise<number> {
  const open = await tx.basket.findMany({
    where: { agentId, status: "OPEN" },
    select: { id: true, factoryId: true },
    orderBy: { factoryId: "asc" },
  });
  let locked = 0;
  for (const b of open) {
    await lockBasketSlot(tx, agentId, b.factoryId);
    const row = await tx.basket.findUniqueOrThrow({
      where: { id: b.id },
      select: { status: true },
    });
    if (row.status !== "OPEN") continue;
    if (!(await tx.order.count({ where: { basketId: b.id, status: "PAID" } }))) continue;
    await lockBasket(tx, b.id, "SUSPENDED", now);
    locked++;
  }
  return locked;
}

export function cleanNote(note: unknown, required: boolean, label: string): string | null {
  const text = typeof note === "string" ? note.trim() : "";
  if (required && !text) throw new AgentError(`Enter the ${label}`);
  if (text.length > NOTE_MAX) throw new AgentError(`The ${label} is too long`);
  return text || null;
}
