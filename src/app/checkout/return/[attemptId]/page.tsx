import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getGateway } from "@/server/payments/gateway";

export const metadata: Metadata = { title: "Payment" };

const LABEL = {
  SUCCEEDED: "Paid",
  LATE_PAID: "Paid as tokens",
  FAILED: "Not paid",
  PENDING: "Checking",
} as const;

export default async function CheckoutReturnPage({
  params,
}: PageProps<"/checkout/return/[attemptId]">) {
  const { attemptId } = await params;
  const user = await requireUser([], `/checkout/return/${attemptId}`);
  const attempt = await db.paymentAttempt.findUnique({
    where: { id: attemptId },
    select: { buyerId: true, amount: true, status: true },
  });
  if (!attempt || attempt.buyerId !== user.id) notFound();

  // Only the server notice marks anything paid; the gateway's answer is shown, never stored.
  let state: keyof typeof LABEL =
    attempt.status === "SUCCEEDED" || attempt.status === "LATE_PAID" || attempt.status === "PENDING"
      ? attempt.status
      : "FAILED";
  if (state === "PENDING") {
    try {
      state = await getGateway().fetchStatus(attemptId);
    } catch {
      state = "PENDING";
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{LABEL[state]}</h1>
      <Card className="flex flex-col gap-4">
        <p className="text-3xl font-semibold tabular-nums">{formatLKR(attempt.amount)}</p>
        <LinkButton href="/orders">Orders</LinkButton>
      </Card>
    </div>
  );
}
