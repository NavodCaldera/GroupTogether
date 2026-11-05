import { amountDue } from "@/lib/cart-rules";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink, Countdown } from "@/components/client";
import { Alert, Card, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { cartByCode } from "@/server/carts/queries";
import { sweep } from "@/server/carts/service";
import { getSettings } from "@/server/settings";
import { SlipForm } from "../cart-forms";

export const metadata: Metadata = { title: "Pay for the cart" };

export default async function PayPage({ params }: PageProps<"/c/[code]/pay">) {
  const { code } = await params;
  const user = await requireUser([], `/c/${code}/pay`);
  let cart = await cartByCode(code);
  if (!cart) notFound();
  if ((await sweep(new Date(), cart.id)).closed) cart = (await cartByCode(code))!;
  if (cart.ownerId !== user.id || cart.status !== "AWAITING_SLIP") redirect(`/c/${cart.code}`);
  const due = amountDue(
    cart.total.toString(),
    cart.lines.map((l) => l.tokensApplied.toString()),
  );
  const s = await getSettings();
  const rejected = cart.slips[0]?.status === "REJECTED" ? cart.slips[0] : null;

  return (
    <div className="mx-auto w-full max-w-lg">
      <BackLink fallback={`/c/${cart.code}`} />
      <PageHeader
        title={`Pay ${formatLKR(due)}`}
        description={
          <strong className="text-warn">
            <Countdown until={cart.slipDueAt!.toISOString()} />
          </strong>
        }
      />
      {rejected && (
        <div className="mb-4">
          <Alert>Your last slip was not accepted: {rejected.reviewNote}</Alert>
        </div>
      )}
      <Card className="mb-4">
        <h2 className="mb-2 font-semibold">Bank transfer details</h2>
        {s.accountNumber ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-subtle">Bank</dt>
            <dd>{s.bankName}</dd>
            <dt className="text-subtle">Branch</dt>
            <dd>{s.bankBranch}</dd>
            <dt className="text-subtle">Account name</dt>
            <dd>{s.accountName}</dd>
            <dt className="text-subtle">Account no.</dt>
            <dd className="font-mono font-semibold">{s.accountNumber}</dd>
            <dt className="text-subtle">Amount</dt>
            <dd className="font-semibold">{formatLKR(due)}</dd>
            <dt className="text-subtle">Reference</dt>
            <dd className="font-mono font-semibold">{cart.code}</dd>
          </dl>
        ) : (
          <p className="text-sm text-danger">
            Bank details haven&apos;t been set up yet. Please contact us.
          </p>
        )}
      </Card>
      <Card>
        <SlipForm cartId={cart.id} />
      </Card>
    </div>
  );
}
