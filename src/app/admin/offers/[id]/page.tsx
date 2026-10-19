import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { OfferDecision } from "../offer-decision";
import { OFFER_STATUS } from "../offer-status";

export const metadata: Metadata = { title: "Stock offer" };

/** One stock offer: what the seller sent, who they are, and Accept / Decline (confirmed) with a note. */
export default async function OfferPage({ params }: PageProps<"/admin/offers/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const o = await db.stockOffer.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, name: true, company: true, phone: true, email: true } },
    },
  });
  if (!o) notFound();
  const open = o.status === "IN_REVIEW";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <BackLink fallback="/admin/offers" />
        <PageHeader
          title={o.name}
          description={`Sent ${formatDateTime(o.createdAt)}`}
          actions={<Badge tone={OFFER_STATUS[o.status].tone}>{OFFER_STATUS[o.status].label}</Badge>}
        />
      </div>

      <Card className="flex flex-col gap-3">
        <div>
          <p className="text-xs text-subtle">Total price asked</p>
          <p className="text-2xl font-semibold tabular-nums">{formatLKR(o.amount)}</p>
        </div>
        <div>
          <p className="text-xs text-subtle">Details</p>
          <p className="text-sm whitespace-pre-line">{o.description}</p>
        </div>
      </Card>

      <Card className="text-sm">
        <p className="font-medium">{o.seller.company || o.seller.name}</p>
        <p className="text-subtle">{o.seller.name}</p>
        {o.seller.phone && (
          <a href={`tel:${o.seller.phone}`} className="text-accent underline">
            {o.seller.phone}
          </a>
        )}
        <p className="text-subtle">{o.seller.email}</p>
      </Card>

      {open ? (
        <Card>
          <OfferDecision offerId={o.id} name={o.name} />
        </Card>
      ) : (
        <Card className="text-sm">
          <p>
            {o.status === "ACCEPTED" ? "Accepted" : "Declined"} {formatDateTime(o.decidedAt)}
          </p>
          {o.note && <p className="mt-1 text-subtle">Note: {o.note}</p>}
        </Card>
      )}
    </div>
  );
}
