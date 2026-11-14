import "server-only";
import { D, roundMoney, toD } from "@/lib/decimal";
import { lineEarning } from "@/lib/agent-money";
import { weekEnding, weekOf } from "@/lib/agent-rules";
import type { DeductionKind, Prisma, ReturnStatus } from "@/generated/prisma/client";
import { assertAdminArea } from "../auth/service";
import { CartError } from "@/server/errors";
import { db } from "../db";
import { getSettings } from "../settings";
import { post } from "../tokens";
import { agentFeeKey, settleClawbacks } from "../agent-fees";
import { withOrderTransaction } from "../orders/locks";

class PayoutError extends CartError {}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Agent fees for missed weeks are caught up this far back. */
const FEE_CATCH_UP_WEEKS = 4;
/** A line with a return in one of these is held from payment. LAPSED and the rest are settled. */
export const PAYOUT_HOLD_RETURNS: ReturnStatus[] = [
  "WAITING_FACTORY",
  "WITH_ADMIN",
  "ACCEPTED",
  "AWAITING_HANDOVER",
];

export { weekOf };

/** Lines payable by `end`: received at least collectHours before it, never paid, no open return
 * and no missing report waiting for an admin (its removed units must not be paid). */
export function payableLines(end: Date, collectHours: number, factoryId?: string) {
  return {
    payoutItems: { none: {} },
    missingReportedQty: 0,
    // Buyer-fault returns never hold the factory payout (DEC-017).
    returns: { none: { status: { in: PAYOUT_HOLD_RETURNS }, fault: "FACTORY" } },
    order: {
      ...(factoryId ? { factoryId } : {}),
      status: { in: ["PAID", "RECEIVED"] },
      receivedAt: { lte: new Date(end.getTime() - collectHours * 3_600_000) },
    },
  } satisfies Prisma.OrderLineWhereInput;
}

/** One FactoryPayout per factory for weekEnding(now) that has payable lines. Waiting deductions
 * from that week come off; a shortfall carries to the next payout. Each factory runs in its own
 * transaction under the factory's user advisory (which also fences return deductions).
 * Returns how many payouts were created.
 */
export async function buildWeeklyPayouts(now: Date): Promise<number> {
  const end = weekEnding(now);
  const { collectHours } = await getSettings();
  const factories = await db.order.findMany({
    where: { lines: { some: payableLines(end, collectHours) } },
    select: { factoryId: true },
    distinct: ["factoryId"],
    orderBy: { factoryId: "asc" },
  });
  let built = 0;
  for (const { factoryId } of factories) {
    try {
      built += await withOrderTransaction([factoryId], [], async (tx) => {
        if (
          await tx.factoryPayout.findUnique({
            where: { factoryId_weekEnding: { factoryId, weekEnding: end } },
          })
        )
          return 0;
        const lines = await tx.orderLine.findMany({
          where: payableLines(end, collectHours, factoryId),
          select: { id: true, qty: true, returnedQty: true, missingQty: true, factoryPrice: true },
          orderBy: { id: "asc" },
        });
        if (!lines.length) return 0;
        const items = lines.map((l) => ({
          orderLineId: l.id,
          amount: lineEarning(l.qty, l.returnedQty, l.missingQty, toD(l.factoryPrice)),
        }));
        const waiting = await tx.payoutDeduction.findMany({
          where: { factoryId, payoutId: null, createdAt: { lte: end } },
          select: { id: true, kind: true, amount: true },
          orderBy: { id: "asc" },
        });
        const gross = roundMoney(items.reduce((s, i) => s.plus(i.amount), new D(0)));
        const deductions = roundMoney(waiting.reduce((s, d) => s.plus(toD(d.amount)), new D(0)));
        const net = D.max(gross.minus(deductions), 0);
        const payout = await tx.factoryPayout.create({
          data: {
            factoryId,
            weekEnding: end,
            gross: gross.toFixed(2),
            deductions: deductions.toFixed(2),
            net: net.toFixed(2),
            items: {
              create: items.map((i) => ({
                orderLineId: i.orderLineId,
                amount: i.amount.toFixed(2),
              })),
            },
          },
        });
        if (waiting.length)
          await tx.payoutDeduction.updateMany({
            where: { id: { in: waiting.map((d) => d.id) } },
            data: { payoutId: payout.id },
          });
        if (deductions.gt(gross)) {
          const largest = waiting.reduce((a, b) => (toD(b.amount).gt(toD(a.amount)) ? b : a));
          await tx.payoutDeduction.create({
            data: {
              factoryId,
              kind: largest.kind as DeductionKind,
              amount: deductions.minus(gross).toFixed(2),
              ref: `carry:${payout.id}`,
            },
          });
        }
        return 1;
      });
    } catch (error) {
      console.error("Payout build failed; the lines wait for the next week", factoryId, error);
    }
  }
  return built;
}

/** AGENT_FEE tokens for every agent, per week ending on or before weekEnding(now):
 * Σ (qty − missing − returned) × agentFeeEach over orders received at the agent that week. Only
 * factory-fault returns change returnedQty, and their fee is not paid (DEC-018). Each agent-week
 * is summed inside the agent's user advisory, which collectReturn also holds, so a return
 * collected meanwhile is either left out here or taken back there, never both. Missed weeks are
 * caught up for FEE_CATCH_UP_WEEKS. After each credit, older fee take-backs come off.
 * Returns how many credits were made.
 */
export async function creditAgentFees(now: Date): Promise<number> {
  const end = weekEnding(now);
  const orders = await db.order.findMany({
    where: {
      status: "RECEIVED",
      receivedAt: { gt: new Date(end.getTime() - FEE_CATCH_UP_WEEKS * WEEK_MS), lte: end },
    },
    select: { agentId: true, receivedAt: true, agent: { select: { userId: true } } },
  });
  const due = new Map<string, { agentId: string; userId: string; week: Date }>();
  for (const o of orders)
    due.set(agentFeeKey(o.agentId, o.receivedAt!), {
      agentId: o.agentId,
      userId: o.agent.userId,
      week: weekOf(o.receivedAt!),
    });
  const keys = [...due.keys()].sort();
  const done = new Set(
    (
      await db.tokenEntry.findMany({
        where: { eventKey: { in: keys } },
        select: { eventKey: true },
      })
    ).map((e) => e.eventKey),
  );
  let credited = 0;
  for (const eventKey of keys) {
    if (done.has(eventKey)) continue;
    const fee = due.get(eventKey)!;
    try {
      const result = await withOrderTransaction([fee.userId], [], async (tx) => {
        const lines = await tx.orderLine.findMany({
          where: {
            order: {
              agentId: fee.agentId,
              status: "RECEIVED",
              receivedAt: { gt: new Date(fee.week.getTime() - WEEK_MS), lte: fee.week },
            },
          },
          select: { qty: true, missingQty: true, returnedQty: true, agentFeeEach: true },
        });
        const amount = lines.reduce(
          (sum, l) =>
            sum.plus(toD(l.agentFeeEach).times(Math.max(l.qty - l.missingQty - l.returnedQty, 0))),
          new D(0),
        );
        if (amount.lte(0)) return "skipped" as const;
        const posted = await post(tx, {
          userId: fee.userId,
          amount: roundMoney(amount),
          kind: "AGENT_FEE",
          eventKey,
          note: "Agent fees for the week",
        });
        await settleClawbacks(tx, fee.agentId, fee.userId);
        return posted;
      });
      if (result === "created") credited++;
    } catch (error) {
      console.error("Agent fee credit will retry", eventKey, error);
    }
  }
  return credited;
}

/** Core admin records the Sunday bank transfer for a payout, once. */
export async function markPayoutPaid(
  adminId: string,
  payoutId: string,
  bankRef: string,
): Promise<void> {
  try {
    await assertAdminArea(adminId, "CORE");
  } catch {
    throw new PayoutError("Not allowed");
  }
  const ref = typeof bankRef === "string" ? bankRef.trim() : "";
  if (!ref) throw new PayoutError("Enter the bank reference");
  if (ref.length > 100) throw new PayoutError("The bank reference is too long");
  const marked = await db.factoryPayout.updateMany({
    where: { id: payoutId, paidAt: null },
    data: { paidAt: new Date(), paidById: adminId, bankRef: ref },
  });
  if (marked.count !== 1) throw new PayoutError("This payout is already paid");
}
