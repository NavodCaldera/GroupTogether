import "server-only";
import { D, toD } from "@/lib/decimal";
import { db, type Tx } from "../db";
import { post } from "../tokens";
import { markOrdersPaid, releasePendingOrders } from "../orders/baskets";
import { withOrderTransaction } from "../orders/locks";
import { agentDepositPaid } from "../agents/deposit";
import { getGateway, type VerifiedNotice } from "./gateway";

type Outcome =
  | "PAID"
  | "LATE_PAID"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "FAILED"
  | "NOTED"
  | "IGNORED"
  | "UNKNOWN_ATTEMPT";

const validAmount = (given: string) => /^\d{1,12}(\.\d{1,2})?$/.test(given);

function sameAmount(given: string, expected: { toString(): string }): boolean {
  return validAmount(given) && new D(given).eq(toD(expected));
}

/** A unique violation on PaymentEvent (gateway, eventId): another delivery of the same event won. */
function isDuplicateEvent(error: unknown): boolean {
  const e = error as {
    code?: string;
    meta?: {
      target?: unknown;
      modelName?: string;
      driverAdapterError?: {
        cause?: { constraint?: { index?: string; fields?: string[] }; table?: string };
      };
    };
  };
  if (e.code !== "P2002") return false;
  const target = e.meta?.target;
  if (Array.isArray(target))
    return target.includes("gateway") && target.includes("eventId") && target.length === 2;
  if (target === "PaymentEvent_gateway_eventId_key") return true;
  const constraint = e.meta?.driverAdapterError?.cause?.constraint;
  if (constraint?.index === "PaymentEvent_gateway_eventId_key") return true;
  const fields = constraint?.fields;
  return (
    e.meta?.modelName === "PaymentEvent" &&
    Array.isArray(fields) &&
    fields.length === 2 &&
    fields.includes("gateway") &&
    fields.includes("eventId")
  );
}

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
    if (isDuplicateEvent(error)) return { status: 200 };
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
      // Each distinct real charge is credited once; replays of one payment id stop at the event gate.
      const lateKey = `late:${attempt.id}:${notice.gatewayRef}`;
      if (notice.currency !== "LKR" || notice.currency !== attempt.currency)
        return "CURRENCY_MISMATCH";
      if (!sameAmount(notice.amount, attempt.amount)) {
        // Money was taken but does not match: credit what was received; the orders expire.
        const received = validAmount(notice.amount) ? new D(notice.amount) : null;
        if (received && received.gt(0))
          await post(tx, {
            userId: payerId,
            amount: received,
            kind: "LATE_PAYMENT",
            eventKey: lateKey,
            note: "Payment did not match the order amount",
          });
        return "AMOUNT_MISMATCH";
      }
      const onTime =
        attempt.status === "PENDING" && attempt.orders.every((o) => o.status === "PENDING");
      if (onTime) {
        // A deposit for an agent that is no longer APPROVED takes the late path below.
        let applied = true;
        if (attempt.purpose === "DEPOSIT") applied = await agentDepositPaid(tx, attempt.id);
        else await markOrdersPaid(tx, orderIds, now);
        if (applied) {
          await tx.paymentAttempt.update({
            where: { id: attempt.id },
            data: { status: "SUCCEEDED" },
          });
          return "PAID";
        }
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
        eventKey: lateKey,
        note:
          attempt.purpose === "DEPOSIT"
            ? "Deposit payment arrived when it was no longer due"
            : "Payment arrived after the order closed",
      });
      return "LATE_PAID";
    }
  }
}
