import "server-only";
import { randomUUID } from "node:crypto";
import { gatewayFee } from "@/lib/agent-money";
import { toD } from "@/lib/decimal";
import { type Tx } from "../db";
import { getSettings } from "../settings";
import { appUrl } from "../notify";
import { getGateway } from "../payments/gateway";
import { agentOfUser, AgentError, withAgent } from "./common";

/** An APPROVED agent starts paying the deposit plus the gateway fee. Tokens never pay it. A
 * second attempt is allowed; if both are paid, the later one becomes tokens (late path).
 */
export async function startDeposit(agentUserId: string): Promise<{ redirectUrl: string }> {
  const { id } = await agentOfUser(agentUserId);
  const pay = await withAgent(id, async (tx, agent) => {
    if (agent.status !== "APPROVED") throw new AgentError("The deposit is not due");
    const settings = await getSettings(tx);
    const deposit = toD(settings.agentDeposit);
    const amount = deposit.plus(gatewayFee(deposit, toD(settings.gatewayFeeRate))).toFixed(2);
    const attempt = await tx.paymentAttempt.create({
      data: {
        purpose: "DEPOSIT",
        agentId: agent.id,
        buyerId: null,
        amount,
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

/** Called by the payment notice inside its transaction, which holds the agent user's advisory.
 * Moves APPROVED -> LIVE and returns true; returns false when the agent is no longer APPROVED,
 * so the notice credits the payment as tokens instead.
 */
export async function agentDepositPaid(tx: Tx, attemptId: string): Promise<boolean> {
  const attempt = await tx.paymentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { purpose: true, agentId: true },
  });
  if (attempt.purpose !== "DEPOSIT" || !attempt.agentId) return false;
  await tx.$queryRaw`SELECT 1 FROM "Agent" WHERE id = ${attempt.agentId} FOR UPDATE`;
  const agent = await tx.agent.findUniqueOrThrow({
    where: { id: attempt.agentId },
    select: { id: true, status: true, userId: true },
  });
  if (agent.status !== "APPROVED") return false;
  const settings = await getSettings(tx);
  await tx.agent.update({
    where: { id: agent.id },
    data: {
      status: "LIVE",
      depositPaidAt: new Date(),
      depositAmount: toD(settings.agentDeposit).toFixed(2),
    },
  });
  await tx.user.update({ where: { id: agent.userId }, data: { role: "AGENT" } });
  return true;
}
