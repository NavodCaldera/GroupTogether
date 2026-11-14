import "server-only";
import { D, toD } from "@/lib/decimal";
import { weekOf } from "@/lib/agent-rules";
import type { Tx } from "./db";
import { lockLedgerUsers } from "./orders/locks";
import { post, tokenBalance } from "./tokens";

/** The event key of an agent's weekly AGENT_FEE credit for orders received at `receivedAt`. */
export function agentFeeKey(agentId: string, receivedAt: Date): string {
  return `agentfee:${agentId}:${weekOf(receivedAt).toISOString()}`;
}

/** Takes what it can of one clawback from the agent's tokens; a balance never goes below zero,
 * so the rest stays in `left` for the next weekly fee. Caller holds the agent's ledger lock. */
async function settleOne(tx: Tx, row: { id: string; left: D }, userId: string) {
  const balance = await tokenBalance(userId, tx);
  const take = D.min(balance, row.left);
  if (take.lte(0)) return;
  const left = row.left.minus(take);
  await post(tx, {
    userId,
    amount: take.neg(),
    kind: "FEE_CLAWBACK",
    // `left` only falls, so each partial take has its own key.
    eventKey: `clawback:${row.id}:${row.left.toFixed(2)}`,
    note: "Agent fee taken back for a factory-fault return",
  });
  await tx.agentFeeClawback.update({ where: { id: row.id }, data: { left: left.toFixed(2) } });
}

/** A factory-fault return collected after the agent was paid that week's fee takes the fee back
 * (DEC-018). Caller holds the agent's user advisory, which also fences creditAgentFees. */
export async function takeBackFee(
  tx: Tx,
  agent: { id: string; userId: string },
  returnId: string,
  amount: D,
) {
  if (amount.lte(0)) return;
  const row = await tx.agentFeeClawback.create({
    data: { agentId: agent.id, returnId, amount: amount.toFixed(2), left: amount.toFixed(2) },
    select: { id: true },
  });
  await lockLedgerUsers(tx, [agent.userId]);
  await settleOne(tx, { id: row.id, left: amount }, agent.userId);
}

/** After a weekly fee credit: older shortfalls come off first. */
export async function settleClawbacks(tx: Tx, agentId: string, userId: string) {
  const rows = await tx.agentFeeClawback.findMany({
    where: { agentId, left: { gt: 0 } },
    orderBy: { createdAt: "asc" },
    select: { id: true, left: true },
  });
  if (!rows.length) return;
  await lockLedgerUsers(tx, [userId]);
  for (const row of rows) await settleOne(tx, { id: row.id, left: toD(row.left) }, userId);
}

/** What a closing agent still owes in fee take-backs; recorded as a loss against the deposit. */
export async function clawbackOwed(tx: Tx, agentId: string): Promise<D> {
  const owed = await tx.agentFeeClawback.aggregate({
    where: { agentId, left: { gt: 0 } },
    _sum: { left: true },
  });
  return owed._sum.left === null ? new D(0) : toD(owed._sum.left);
}
