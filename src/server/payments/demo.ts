import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import type { Gateway, NoticeStatus, VerifiedNotice } from "./gateway";

const md5 = (s: string) => createHash("md5").update(s).digest("hex").toUpperCase();

export type NoticeFields = {
  merchant_id: string;
  order_id: string;
  payment_id: string;
  payhere_amount: string;
  payhere_currency: string;
  status_code: string;
};

/** PayHere's checksum: UPPER(md5(merchant_id + order_id + amount + currency + status + UPPER(md5(secret)))). */
export function signNotice(f: NoticeFields, secret: string): string {
  return md5(
    f.merchant_id +
      f.order_id +
      f.payhere_amount +
      f.payhere_currency +
      f.status_code +
      md5(secret),
  );
}

/** Where the demo payment page returns the payer: the deposit page for a deposit, else checkout. */
export function demoReturnPath(attempt: { id: string; purpose: "ORDERS" | "DEPOSIT" }): string {
  return attempt.purpose === "DEPOSIT"
    ? `/agent/deposit/${attempt.id}`
    : `/checkout/return/${attempt.id}`;
}

const STATUS: Record<string, NoticeStatus> = {
  "2": "SUCCEEDED",
  "0": "PENDING",
  "-1": "CANCELLED",
  "-2": "FAILED",
};

export function verifyNotice(raw: string, _headers?: unknown): VerifiedNotice | null {
  const merchantId = process.env.DEMO_MERCHANT_ID;
  const secret = process.env.DEMO_MERCHANT_SECRET;
  if (!merchantId || !secret) return null;
  const p = new URLSearchParams(raw);
  const f = {
    merchant_id: p.get("merchant_id") ?? "",
    order_id: p.get("order_id") ?? "",
    payment_id: p.get("payment_id") ?? "",
    payhere_amount: p.get("payhere_amount") ?? "",
    payhere_currency: p.get("payhere_currency") ?? "",
    status_code: p.get("status_code") ?? "",
  };
  const given = (p.get("md5sig") ?? "").toUpperCase();
  if (f.merchant_id !== merchantId || !f.order_id || !f.payment_id) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(signNotice(f, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const status = STATUS[f.status_code];
  if (!status) return null;
  return {
    eventId: `${f.payment_id}:${f.status_code}`,
    attemptId: f.order_id,
    gatewayRef: f.payment_id,
    amount: f.payhere_amount,
    currency: f.payhere_currency,
    status,
  };
}

export const demoGateway: Gateway = {
  async createCheckout(a) {
    return { redirectUrl: appUrl(`/demo-pay/${a.attemptId}`) };
  },
  verifyNotice,
  async fetchStatus(attemptId) {
    // Lazy: keeps the pure helpers above importable without a database (unit tests).
    const { db } = await import("../db");
    const row = await db.paymentAttempt.findUnique({
      where: { id: attemptId },
      select: { status: true },
    });
    if (row?.status === "SUCCEEDED" || row?.status === "LATE_PAID") return "SUCCEEDED";
    if (row?.status === "FAILED" || row?.status === "EXPIRED") return "FAILED";
    return "PENDING";
  },
};
