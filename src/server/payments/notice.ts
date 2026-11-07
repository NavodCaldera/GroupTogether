import "server-only";
import { D, toD } from "@/lib/decimal";
import { db, type Tx } from "../db";
import { post } from "../tokens";
import { markOrdersPaid, releasePendingOrders } from "../orders/baskets";
import { withOrderTransaction } from "../orders/locks";
import { getGateway, type VerifiedNotice } from "./gateway";

type Outcome =
  "PAID" | "LATE_PAID" | "AMOUNT_MISMATCH" | "FAILED" | "NOTED" | "IGNORED" | "UNKNOWN_ATTEMPT";

/** Task 11 replaces this with the agent deposit service. */
async function agentDepositPaid(_tx: Tx, _attemptId: string): Promise<void> {
  throw new Error("Deposit payments are not built yet");
}

function sameAmount(given: string, expected: { toString(): string }): boolean {
  if (!/^\d+(\.\d{1,2})?$/.test(given)) return false;
  return new D(given).eq(toD(expected));
}

const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === "P2002";

/** Verifies a signed gateway notice and applies it exactly once.
 * Lock order: payer advisory -> the attempt's Order rows -> (markOrdersPaid: basket advisories ->
 * Variant rows -> Basket rows -> ledger) or (release: Variant rows -> ledger).
 */
export async function handleNotice(raw: string, headers: Headers): Promise<{ status: 200 | 400 }> {
  const gatewayName = process.env.PAYMENT_GATEWAY ?? "";
  const notice = getGateway().verifyNotice(raw, headers);
  if (!notice) return { status: 400 };

  const attempt = await db.paymentAttempt.findUnique({
    where: { id: notice.attemptId },
    select: {
      id: true,
      buyerId: true,
      agent: { select: { userId: true } },
      orders: { select: { id: true } },
    },
  });
  if (!attempt) {
    await db.paymentEvent.createMany({
      data: [{ gateway: gatewayName, eventId: notice.eventId, outcome: "UNKNOWN_ATTEMPT" }],
      skipDuplicates: true,
    });
    return { status: 200 };
  }

  const payerId = attempt.buyerId ?? attempt.agent?.userId ?? attempt.id;
  try {
    await withOrderTransaction(
      [payerId],
      attempt.orders.map((o) => o.id),
      async (tx) => {
        const seen = await tx.paymentEvent.findUnique({
          where: { gateway_eventId: { gateway: gatewayName, eventId: notice.eventId } },
          select: { id: true },
        });
        if (seen) return;
        const event = await tx.paymentEvent.create({
          data: {
            gateway: gatewayName,
            eventId: notice.eventId,
            attemptId: attempt.id,
            outcome: "RECEIVED",
          },
          select: { id: true },
        });
        const outcome = await applyNotice(tx, notice, payerId);
        await tx.paymentEvent.update({ where: { id: event.id }, data: { outcome } });
      },
    );
  } catch (error) {
    // Another delivery of the same event committed first.
    if (isUniqueViolation(error)) return { status: 200 };
    throw error;
  }
  return { status: 200 };
}

/** Caller holds the payer advisory and the attempt's Order rows. */
async function applyNotice(tx: Tx, notice: VerifiedNotice, payerId: string): Promise<Outcome> {
  const attempt = await tx.paymentAttempt.findUniqueOrThrow({
    where: { id: notice.attemptId },
    include: { orders: { select: { id: true, status: true }, orderBy: { id: "asc" } } },
  });
  // Checkout stores a placeholder; the first verified notice records the gateway's payment id.
  if (attempt.gatewayRef.startsWith("ga_"))
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { gatewayRef: notice.gatewayRef },
    });
  const orderIds = attempt.orders.map((o) => o.id);
  const now = new Date();

  switch (notice.status) {
    case "PENDING":
      return "NOTED";
    case "FAILED":
    case "CANCELLED": {
      if (attempt.status !== "PENDING") return "IGNORED";
      await releasePendingOrders(tx, orderIds);
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED" } });
      return "FAILED";
    }
    case "SUCCEEDED": {
      if (!sameAmount(notice.amount, attempt.amount) || notice.currency !== attempt.currency)
        return "AMOUNT_MISMATCH";
      const onTime =
        attempt.status === "PENDING" && attempt.orders.every((o) => o.status === "PENDING");
      if (onTime) {
        if (attempt.purpose === "DEPOSIT") await agentDepositPaid(tx, attempt.id);
        else await markOrdersPaid(tx, orderIds, now);
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: "SUCCEEDED" },
        });
        return "PAID";
      }
      if (attempt.status !== "SUCCEEDED")
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: "LATE_PAID" },
        });
      await post(tx, {
        userId: payerId,
        amount: toD(attempt.amount),
        kind: "LATE_PAYMENT",
        eventKey: `late:${attempt.id}`,
        note: "Payment arrived after the order closed",
      });
      return "LATE_PAID";
    }
  }
}
