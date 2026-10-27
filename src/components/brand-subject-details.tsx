import Link from "next/link";
import { db } from "@/server/db";
import { formatDateTime, formatLKR } from "@/lib/format";
import { giftReference, GIFT_STATUS } from "@/lib/gift-rules";
import { snapshotTerms } from "@/server/brand-reviews";
import { GiftProductDetails } from "./gift-product-details";
import { BrandRevisionChanges } from "./brand-revision-changes";
/** Context is already authorised by subjectContext; keep every lookup scoped to that brand. */
export async function BrandSubjectDetails({
  context,
  admin,
}: {
  context: { brandId: string; kind: string; subjectId: string };
  admin: boolean;
}) {
  if (context.kind === "PRODUCT") {
    const offer = await db.stockOffer.findFirst({
      where: { id: context.subjectId, sellerId: context.brandId },
      include: { revisions: { orderBy: { version: "desc" } } },
    });
    if (!offer) return null;
    const ids = offer.revisions.flatMap((revision) => [
      revision.submittedById,
      ...(revision.reviewedById ? [revision.reviewedById] : []),
    ]);
    const names = new Map(
      (
        await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      ).map((user) => [user.id, user.name]),
    );
    return (
      <details>
        <summary className="min-h-11 cursor-pointer text-sm font-medium">
          Product terms & revision history
        </summary>
        <p className="mb-3 text-sm">
          {offer.status === "ACCEPTED"
            ? `Live partner price: ${formatLKR(offer.offerPrice ?? 0)}`
            : "Not yet approved for reservations"}
        </p>
        <ol className="flex flex-col gap-3">
          {offer.revisions.map((revision, index) => {
            const terms = snapshotTerms(revision.snapshot);
            return (
              <li key={revision.id} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-semibold">
                  Revision {revision.version} ·{" "}
                  {revision.supersededAt
                    ? "Replaced by newer submission"
                    : revision.status.replaceAll("_", " ")}
                </p>
                <p>
                  Retail {formatLKR(terms.actualPrice ?? 0)} · Partner{" "}
                  {formatLKR(terms.offerPrice ?? 0)} · {terms.pieces} gifts
                </p>
                <p className="text-xs text-subtle">
                  Submitted {formatDateTime(revision.createdAt)} ·{" "}
                  {names.get(revision.submittedById) || "Legacy account"}
                </p>
                {revision.reviewedAt && (
                  <p className="text-xs text-subtle">
                    Reviewed {formatDateTime(revision.reviewedAt)} ·{" "}
                    {revision.reviewedById ? names.get(revision.reviewedById) : "Legacy review"}
                  </p>
                )}
                <GiftProductDetails
                  offer={{ ...terms, id: offer.id, photoRevision: revision.version }}
                />
                <BrandRevisionChanges
                  current={terms}
                  previous={
                    offer.revisions[index + 1]
                      ? snapshotTerms(offer.revisions[index + 1].snapshot)
                      : undefined
                  }
                />
              </li>
            );
          })}
        </ol>
        <Link
          href={
            admin
              ? `/admin/brands?tab=products&brand=${context.brandId}&offer=${offer.id}`
              : `/seller/new?offerId=${offer.id}`
          }
          className="inline-flex min-h-11 items-center text-sm text-accent"
        >
          {admin ? "Open product review →" : "Propose revised terms →"}
        </Link>
      </details>
    );
  }
  if (context.kind === "GIFT") {
    const gift = await db.giftOrder.findFirst({
      where: {
        id: context.subjectId,
        offer: { sellerId: context.brandId },
        ...(!admin ? { paidAt: { not: null } } : {}),
      },
    });
    if (!gift) return null;
    const timeline: [[string, Date | null], ...[string, Date | null][]] = [
      ["Reserved", gift.createdAt],
      ["Basket payment approved", gift.paidAt],
      ["Brand acknowledged", gift.acknowledgedAt],
      ["Dispatched", gift.dispatchedAt],
      ["Delivered", gift.deliveredAt],
      ["Bill approved", gift.billApprovedAt],
    ];
    return (
      <div className="rounded-lg bg-muted p-3 text-sm">
        <p className="font-medium">
          {giftReference(gift.id)} · {GIFT_STATUS[gift.status]} · Agreed charge{" "}
          {formatLKR(gift.partnerPrice)}
        </p>
        {gift.courier && (
          <p className="break-words">
            {gift.courier} · {gift.tracking}
          </p>
        )}
        {gift.issue && <p className="mt-2 text-danger">{gift.issue}</p>}
        <details>
          <summary className="min-h-11 cursor-pointer">Order timeline</summary>
          <ol className="space-y-1">
            {timeline
              .filter(([, date]) => date)
              .map(([label, date]) => (
                <li key={label}>
                  {label} · {formatDateTime(date)}
                </li>
              ))}
          </ol>
          {gift.status === "ISSUE" && (
            <p className="mt-2 text-subtle">
              This gift remains on hold until dispatch resumes. Resolving a conversation leaves the
              gift status unchanged.
            </p>
          )}
        </details>
      </div>
    );
  }
  if (context.kind === "SETTLEMENT") {
    const payment = await db.giftSettlement.findFirst({
      where: { id: context.subjectId, brandId: context.brandId },
      include: {
        gifts: { select: { id: true, partnerPrice: true, offer: { select: { name: true } } } },
      },
    });
    if (!payment) return null;
    return (
      <details>
        <summary className="min-h-11 cursor-pointer text-sm font-medium">
          Settlement statement · {formatLKR(payment.amount)}
        </summary>
        <p className="mb-2 text-sm">
          {payment.reference} · {formatDateTime(payment.paidAt)}
          {payment.queryOpen ? " · Payment query open" : ""}
          {payment.receivedAt ? " · Receipt confirmed" : ""}
        </p>
        <ul className="divide-y divide-line text-sm">
          {payment.gifts.map((gift) => (
            <li key={gift.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                {giftReference(gift.id)} · {gift.offer.name}
              </span>
              <span>{formatLKR(gift.partnerPrice)}</span>
            </li>
          ))}
        </ul>
      </details>
    );
  }
  return null;
}
