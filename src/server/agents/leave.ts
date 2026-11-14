import "server-only";
import { clawbackOwed } from "../agent-fees";
import { D, toD } from "@/lib/decimal";
import { db, type Tx } from "../db";
import { notify } from "../notify";
import { post } from "../tokens";
import { agentOfUser, AgentError, lockOpenBaskets, requireAgentsAdmin, withAgent } from "./common";

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
  // A basket holding PAID orders has not reached the agent yet; an empty OPEN one is ignored.
  const onTheWay = await tx.basket.count({
    where: { agentId, status: { not: "AT_AGENT" }, orders: { some: { status: "PAID" } } },
  });
  if (onTheWay) return false;
  // Checkout refuses a non-LIVE agent, so no new PENDING order can appear after this.
  if (await tx.order.count({ where: { agentId, status: "PENDING" } })) return false;
  const returns = await tx.returnRequest.count({
    // A buyer-fault item waiting for resale also keeps the agent open (DEC-017).
    where: {
      handoverAgentId: agentId,
      status: { in: ["AWAITING_HANDOVER", "HANDED_OVER", "WITH_AGENT"] },
    },
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
    let done: { userId: string; back: D; paid: boolean } | null;
    try {
      done = await withAgent(id, async (tx, agent) => {
        if (agent.status !== "LEAVING" || !(await settled(tx, agent.id))) return null;
        await tx.agent.update({ where: { id: agent.id }, data: { status: "LEFT", leftAt: now } });
        // Fee take-backs still owed come off the deposit too (DEC-018).
        const owed = await clawbackOwed(tx, agent.id);
        const back = agent.depositPaidAt
          ? D.max(toD(agent.depositAmount).minus(toD(agent.lossAmount)).minus(owed), 0)
          : new D(0);
        if (owed.gt(0) && agent.depositPaidAt)
          await tx.agentFeeClawback.updateMany({
            where: { agentId: agent.id, left: { gt: 0 } },
            data: { left: 0 },
          });
        if (back.gt(0))
          await post(tx, {
            userId: agent.userId,
            amount: back,
            kind: "DEPOSIT_RETURN",
            eventKey: `deposit-return:${agent.id}`,
            note: "Deposit returned less losses and fees taken back",
          });
        return { userId: agent.userId, back, paid: !!agent.depositPaidAt };
      });
    } catch (error) {
      console.error("Agent close will retry", id, error);
      continue;
    }
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

/** Agents and orders admin: a leaving (or left) agent's held returns go back on a return-only
 * courier the admin books. HANDED_OVER -> PICKED_UP; the factory then marks them received.
 * Returns how many moved.
 */
export async function collectHeldReturns(adminId: string, agentId: string): Promise<number> {
  await requireAgentsAdmin(adminId);
  return withAgent(agentId, async (tx, agent) => {
    if (agent.status !== "LEAVING" && agent.status !== "LEFT")
      throw new AgentError("Only a leaving agent's returns can be collected");
    const moved = await tx.returnRequest.updateMany({
      where: { handoverAgentId: agent.id, status: "HANDED_OVER" },
      data: { status: "PICKED_UP" },
    });
    return moved.count;
  });
}
