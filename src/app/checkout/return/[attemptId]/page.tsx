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
    select: {
      buyerId: true,
      amount: true,
      status: true,
      orders: {
        select: { basketId: true, targetBasketId: true, basket: { select: { kind: true } } },
        take: 1,
      },
    },
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

  // An own-basket payment leads back to that basket (DEC-023); agent orders go to Orders.
  const o = attempt.orders[0];
  const own = o?.targetBasketId ?? (o?.basket?.kind === "OWN" ? o.basketId : null);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{LABEL[state]}</h1>
      <Card className="flex flex-col gap-4">
        <p className="text-3xl font-semibold tabular-nums">{formatLKR(attempt.amount)}</p>
        {own ? (
          <LinkButton href={`/own-baskets/${own}`}>Back to basket</LinkButton>
        ) : (
          <LinkButton href="/orders">Orders</LinkButton>
        )}
      </Card>
    </div>
  );
}
