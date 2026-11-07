import "server-only";
import { demoGateway } from "./demo";

export type NoticeStatus = "SUCCEEDED" | "FAILED" | "CANCELLED" | "PENDING";

export type VerifiedNotice = {
  eventId: string;
  attemptId: string;
  gatewayRef: string;
  /** 2-dp string */
  amount: string;
  currency: string;
  status: NoticeStatus;
};

export interface Gateway {
  createCheckout(a: {
    attemptId: string;
    amount: string;
    currency: string;
    returnUrl: string;
    notifyUrl: string;
    buyer: { id: string; name?: string | null; email?: string | null };
  }): Promise<{ redirectUrl: string }>;
  verifyNotice(raw: string, headers: Headers | Record<string, string | undefined>): VerifiedNotice | null;
  fetchStatus(attemptId: string): Promise<"SUCCEEDED" | "FAILED" | "PENDING">;
}

/** The active gateway. PayHere is added later behind the same interface. */
export function getGateway(): Gateway {
  if (process.env.PAYMENT_GATEWAY === "demo") return demoGateway;
  throw new Error("No payment gateway configured: set PAYMENT_GATEWAY=demo");
}
