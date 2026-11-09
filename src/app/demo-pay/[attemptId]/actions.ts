"use server";

import { randomBytes } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { appUrl } from "@/server/notify";
import { demoReturnPath, signNotice } from "@/server/payments/demo";

const CODES = { pay: "2", fail: "-2", cancel: "-1" } as const;

/** Plays the part of the hosted payment page: posts a signed notice, then returns the payer. */
export async function demoPayAction(attemptId: string, formData: FormData) {
  if (process.env.PAYMENT_GATEWAY !== "demo") notFound();
  const outcome = String(formData.get("outcome"));
  if (!(outcome in CODES)) notFound();
  const merchantId = process.env.DEMO_MERCHANT_ID;
  const secret = process.env.DEMO_MERCHANT_SECRET;
  if (!merchantId || !secret) notFound();
  const attempt = await db.paymentAttempt.findUnique({
    where: { id: attemptId },
    select: { id: true, purpose: true, amount: true, currency: true, status: true },
  });
  if (!attempt || attempt.status !== "PENDING") notFound();

  const fields = {
    merchant_id: merchantId,
    order_id: attempt.id,
    payment_id: `demo_${randomBytes(8).toString("hex")}`,
    payhere_amount: attempt.amount.toFixed(2),
    payhere_currency: attempt.currency,
    status_code: CODES[outcome as keyof typeof CODES],
  };
  const body = new URLSearchParams({ ...fields, md5sig: signNotice(fields, secret) });
  try {
    await fetch(appUrl("/api/payments/notify"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
  } catch {
    // The return page reads the attempt's real status; a lost notice is the gateway's retry to fix.
  }
  redirect(demoReturnPath(attempt));
}
