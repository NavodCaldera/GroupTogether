import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getGateway } from "@/server/payments/gateway";

export const metadata: Metadata = { title: "Deposit" };

const LABEL = {
  SUCCEEDED: "Deposit paid",
  LATE_PAID: "Paid as tokens",
  FAILED: "Not paid",
  PENDING: "Checking",
} as const;

/** The gateway returns here after a deposit payment. Only the server notice changes anything. */
export default async function DepositReturnPage({ params }: PageProps<"/agent/deposit/[id]">) {
  const { id } = await params;
  // An approved applicant is still a buyer until the notice makes them an agent.
  const user = await requireUser([], `/agent/deposit/${id}`);
  const attempt = await db.paymentAttempt.findUnique({
    where: { id },
    select: { purpose: true, amount: true, status: true, agent: { select: { userId: true } } },
  });
  if (!attempt || attempt.purpose !== "DEPOSIT" || attempt.agent?.userId !== user.id) notFound();

  let state: keyof typeof LABEL =
    attempt.status === "SUCCEEDED" || attempt.status === "LATE_PAID" || attempt.status === "PENDING"
      ? attempt.status
      : "FAILED";
  if (state === "PENDING") {
    try {
      state = await getGateway().fetchStatus(id);
    } catch {
      state = "PENDING";
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{LABEL[state]}</h1>
      <Card className="flex flex-col gap-4">
        <p className="text-3xl font-semibold tabular-nums">{formatLKR(attempt.amount)}</p>
        {state === "SUCCEEDED" ? (
          <LinkButton href="/agent">Agent home</LinkButton>
        ) : state === "LATE_PAID" ? (
          <LinkButton href="/account">Tokens</LinkButton>
        ) : (
          <LinkButton href="/agents/apply">Back</LinkButton>
        )}
      </Card>
    </div>
  );
}
