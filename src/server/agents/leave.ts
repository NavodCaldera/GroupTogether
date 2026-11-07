import "server-only";
import { D, toD } from "@/lib/decimal";
import { db, type Tx } from "../db";
import { notify } from "../notify";
import { post } from "../tokens";
import { agentOfUser, AgentError, lockOpenBaskets, withAgent } from "./common";

/** The agent stops taking orders; open baskets lock and ship, and buyers keep collecting. */
export async function requestLeave(agentUserId: string): Promise<void> {
  const { id } = await agentOfUser(agentUserId);
  await withAgent(id, async (tx, agent) => {
    if (agent.status !== "LIVE" && agent.status !== "SUSPENDED")
      throw new AgentError("Only an active agent can leave");
    const now = new Date();
    await tx.agent.update({ where: { id: agent.id }, data: { status: "LEAVING" } });
    await lockOpenBaskets(tx, agent.id, now);
  });
}

/** Caller holds the Agent row. True when nothing is left at or on its way to the agent. */
async function settled(tx: Tx, agentId: string): Promise<boolean> {
  const lines = await tx.orderLine.findMany({
    where: { collectedAt: null, status: "ACTIVE", order: { agentId, status: "RECEIVED" } },
    select: { qty: true, missingQty: true },
  });
  if (lines.some((l) => l.qty - l.missingQty > 0)) return false;
  // Every OPEN basket was locked on leave, so anything not AT_AGENT is still on its way.
  if (await tx.basket.count({ where: { agentId, status: { not: "AT_AGENT" } } })) return false;
  // Checkout refuses a non-LIVE agent, so no new PENDING order can appear after this.
  if (await tx.order.count({ where: { agentId, status: "PENDING" } })) return false;
  const returns = await tx.returnRequest.count({
    where: { handoverAgentId: agentId, status: { in: ["AWAITING_HANDOVER", "HANDED_OVER"] } },
  });
  return returns === 0;
}

/** LEAVING agents with every parcel and held return handed over become LEFT; a paid deposit
 * minus losses comes back once as DEPOSIT_RETURN tokens. Returns how many agents closed.
 */
export async function closeLeavingAgents(now: Date): Promise<number> {
  const leaving = await db.agent.findMany({
    where: { status: "LEAVING" },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  let closed = 0;
  for (const { id } of leaving) {
    const done = await withAgent(id, async (tx, agent) => {
      if (agent.status !== "LEAVING" || !(await settled(tx, agent.id))) return null;
      await tx.agent.update({ where: { id: agent.id }, data: { status: "LEFT", leftAt: now } });
      const back = agent.depositPaidAt
        ? toD(agent.depositAmount).minus(toD(agent.lossAmount))
        : new D(0);
      if (back.gt(0))
        await post(tx, {
          userId: agent.userId,
          amount: back,
          kind: "DEPOSIT_RETURN",
          eventKey: `deposit-return:${agent.id}`,
          note: "Deposit returned less losses",
        });
      return { userId: agent.userId, back, paid: !!agent.depositPaidAt };
    });
    if (!done) continue;
    closed++;
    await notify(
      [done.userId],
      {
        title: "Agent account closed",
        body: done.back.gt(0)
          ? `${done.back.toFixed(2)} tokens of your deposit are in your wallet.`
          : done.paid
            ? "Your deposit was used for losses."
            : "Your agent account is closed.",
      },
      `agent-left:${id}`,
    );
  }
  return closed;
}
