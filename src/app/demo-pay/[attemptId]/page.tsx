import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { db } from "@/server/db";
import { demoPayAction } from "./actions";

export const metadata: Metadata = { title: "Demo payment" };

export default async function DemoPayPage({ params }: PageProps<"/demo-pay/[attemptId]">) {
  if (process.env.PAYMENT_GATEWAY !== "demo") notFound();
  const { attemptId } = await params;
  const attempt = await db.paymentAttempt.findUnique({
    where: { id: attemptId },
    select: { amount: true, status: true },
  });
  if (!attempt || attempt.status !== "PENDING") notFound();
  const act = demoPayAction.bind(null, attemptId);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Demo payment</h1>
      <Card className="flex flex-col gap-4">
        <p className="text-3xl font-semibold tabular-nums">{formatLKR(attempt.amount)}</p>
        <form action={act} className="flex flex-col gap-2">
          <Button name="outcome" value="pay" type="submit">
            Pay
          </Button>
          <Button name="outcome" value="fail" type="submit" variant="secondary">
            Fail
          </Button>
          <Button name="outcome" value="cancel" type="submit" variant="ghost">
            Cancel
          </Button>
        </form>
      </Card>
    </div>
  );
}
