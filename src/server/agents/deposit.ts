import "server-only";
import { randomUUID } from "node:crypto";
import { gatewayFee } from "@/lib/agent-money";
import { toD } from "@/lib/decimal";
import { type Tx } from "../db";
import { getSettings } from "../settings";
import { appUrl } from "../notify";
import { getGateway } from "../payments/gateway";
import { agentOfUser, AgentError, withAgent } from "./common";

/** An APPROVED agent with opening hours starts paying the deposit plus the gateway fee. Tokens never pay it. A
 * second attempt is allowed; if both are paid, the later one becomes tokens (late path).
 */
export async function startDeposit(agentUserId: string): Promise<{ redirectUrl: string }> {
  const { id } = await agentOfUser(agentUserId);
  const pay = await withAgent(id, async (tx, agent) => {
    if (agent.status !== "APPROVED" || agent.depositPaidAt)
      throw new AgentError("The deposit is not due");
    // Every agent sets weekly opening hours before going live (FR-029a).
    if (!(await tx.agentHours.count({ where: { agentId: agent.id } })))
      throw new AgentError("Set your opening hours first");
    const settings = await getSettings(tx);
    const deposit = toD(settings.agentDeposit);
    const amount = deposit.plus(gatewayFee(deposit, toD(settings.gatewayFeeRate))).toFixed(2);
    const attempt = await tx.paymentAttempt.create({
      data: {
        purpose: "DEPOSIT",
        agentId: agent.id,
        buyerId: null,
        amount,
        // What comes back on leaving is the deposit charged here, not a later setting.
        depositPrincipal: deposit.toFixed(2),
        currency: "LKR",
        gatewayRef: `ga_${randomUUID()}`,
        expiresAt: new Date(Date.now() + settings.paymentHoldMinutes * 60_000),
      },
      select: { id: true },
    });
    const user = await tx.user.findUniqueOrThrow({
      where: { id: agent.userId },
      select: { id: true, name: true, email: true },
    });
    return { attemptId: attempt.id, amount, user };
  });
  return getGateway().createCheckout({
    attemptId: pay.attemptId,
    amount: pay.amount,
    currency: "LKR",
    returnUrl: appUrl(`/agent/deposit/${pay.attemptId}`),
    notifyUrl: appUrl("/api/payments/notify"),
    buyer: pay.user,
  });
}

/** Caller holds the Agent row. APPROVED -> LIVE and role AGENT. */
export async function goLive(tx: Tx, agent: { id: string; userId: string }): Promise<void> {
  await tx.agent.update({ where: { id: agent.id }, data: { status: "LIVE" } });
  await tx.user.update({ where: { id: agent.userId }, data: { role: "AGENT" } });
}

/** Called by the payment notice inside its transaction, which holds the agent user's advisory.
 * Records the deposit charged on the attempt and moves APPROVED -> LIVE; returns true. An agent
 * with no opening hours keeps the deposit recorded but stays APPROVED until hours are saved
 * (FR-029a). Returns false when the agent is no longer APPROVED or has already paid, so the
 * notice credits the payment as tokens instead.
 */
export async function agentDepositPaid(tx: Tx, attemptId: string): Promise<boolean> {
  const attempt = await tx.paymentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { purpose: true, agentId: true, depositPrincipal: true },
  });
  if (attempt.purpose !== "DEPOSIT" || !attempt.agentId || !attempt.depositPrincipal) return false;
  await tx.$queryRaw`SELECT 1 FROM "Agent" WHERE id = ${attempt.agentId} FOR NO KEY UPDATE`;
  const agent = await tx.agent.findUniqueOrThrow({
    where: { id: attempt.agentId },
    select: { id: true, status: true, userId: true, depositPaidAt: true },
  });
  if (agent.status !== "APPROVED" || agent.depositPaidAt) return false;
  await tx.agent.update({
    where: { id: agent.id },
    data: { depositPaidAt: new Date(), depositAmount: toD(attempt.depositPrincipal).toFixed(2) },
  });
  if (await tx.agentHours.count({ where: { agentId: agent.id } })) await goLive(tx, agent);
  return true;
}
