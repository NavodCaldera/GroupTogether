import "server-only";
import { D, toD } from "@/lib/decimal";
import { db, type Tx } from "../db";
import { confirmPackSpot, lockAttempt, releasePackSpot } from "../packs-join";
import { credit } from "../tokens";
import { getGateway, type VerifiedNotice } from "./gateway";

type Outcome =
  "PAID" | "LATE_PAID" | "AMOUNT_MISMATCH" | "CURRENCY_MISMATCH" | "FAILED" | "NOTED" | "IGNORED";

const money = (given: string) => (/^\d{1,12}(\.\d{1,2})?$/.test(given) ? new D(given) : null);

/** Verifies a signed gateway notice and applies it exactly once per gateway event. */
export async function handleNotice(raw: string, headers: Headers): Promise<{ status: 200 | 400 }> {
  const notice = getGateway().verifyNotice(raw, headers);
  if (!notice) return { status: 400 };
  const gateway = process.env.PAYMENT_GATEWAY ?? "";
  const known = await db.paymentAttempt.count({ where: { id: notice.attemptId } });
  await db.$transaction(async (tx) => {
    if (known) await lockAttempt(tx, notice.attemptId);
    const event = await tx.paymentEvent.createManyAndReturn({
      data: [
        {
          gateway,
          eventId: notice.eventId,
          attemptId: known ? notice.attemptId : null,
          outcome: "UNKNOWN_ATTEMPT",
        },
      ],
      skipDuplicates: true,
      select: { id: true },
    });
    if (!event.length || !known) return;
    await tx.paymentEvent.update({
      where: { id: event[0].id },
      data: { outcome: await apply(tx, notice) },
    });
  });
  return { status: 200 };
}

/** Caller holds the attempt row. */
async function apply(tx: Tx, notice: VerifiedNotice): Promise<Outcome> {
  const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: notice.attemptId } });
  // The first verified notice records the gateway's payment id over the placeholder.
  if (attempt.gatewayRef.startsWith("ga_"))
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { gatewayRef: notice.gatewayRef },
    });
  const setStatus = (status: "SUCCEEDED" | "FAILED" | "LATE_PAID") =>
    tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status } });
  // Each distinct real charge is credited once.
  const giveBack = (amount: D, note: string) =>
    credit(
      tx,
      attempt.buyerId,
      amount,
      "LATE_PAYMENT",
      `late:${attempt.id}:${notice.gatewayRef}`,
      note,
    );

  if (notice.status === "PENDING") return "NOTED";
  if (notice.status !== "SUCCEEDED") {
    if (attempt.status !== "PENDING") return "IGNORED";
    await releasePackSpot(tx, attempt.id);
    await setStatus("FAILED");
    return "FAILED";
  }
  if (notice.currency !== attempt.currency) return "CURRENCY_MISMATCH";
  const received = money(notice.amount);
  if (!received?.eq(toD(attempt.amount))) {
    if (received?.gt(0)) await giveBack(received, "Payment did not match the basket price");
    return "AMOUNT_MISMATCH";
  }
  if (attempt.status === "PENDING" && (await confirmPackSpot(tx, attempt.id))) {
    await setStatus("SUCCEEDED");
    return "PAID";
  }
  if (attempt.status !== "SUCCEEDED") await setStatus("LATE_PAID");
  await giveBack(received, "Basket payment arrived after the spot was released");
  return "LATE_PAID";
}
