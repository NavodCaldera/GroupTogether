import type { Metadata } from "next";
import Link from "next/link";
import { Toast } from "@/components/toast";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { param } from "../list-bits";
import { FilterSelect } from "../filter-select";
import { OFFER_STATUS } from "./offer-status";

export const metadata: Metadata = { title: "Stock offers" };

/**
 * Factory sellers' stock offers (product owner, 2026-10-19): name, details and the total price
 * for the lot. "To review" (oldest first), "Answered", or "Received": every accepted offer whose
 * stock the packing staff marked Received, newest first (2026-10-20). Each opens the offer.
 */
export default async function OffersPage({ searchParams }: PageProps<"/admin/offers">) {
  await requireAdmin("FACTORY");
  const sp = await searchParams;
  const tab = param(sp, "tab");
  const answered = tab === "answered";
  const received = tab === "received";
  const done = param(sp, "done");
  const [offers, toReview, receivedCount] = await Promise.all([
    db.stockOffer.findMany({
      where: received
        ? { receivedAt: { not: null }, seller: { isBrand: false } }
        : answered
          ? { status: { not: "IN_REVIEW" }, seller: { isBrand: false } }
          : { status: "IN_REVIEW", seller: { isBrand: false } },
      orderBy: received
        ? { receivedAt: "desc" }
        : answered
          ? { decidedAt: "desc" }
          : { createdAt: "asc" },
      take: 100,
      include: {
        seller: { select: { name: true, company: true, isBrand: true } },
        receivedBy: { select: { name: true } },
      },
    }),
    db.stockOffer.count({ where: { status: "IN_REVIEW", seller: { isBrand: false } } }),
    db.stockOffer.count({ where: { receivedAt: { not: null }, seller: { isBrand: false } } }),
  ]);

  return (
    <>
      {done === "accepted" && <Toast>Offer accepted. The seller has been told.</Toast>}
      {done === "declined" && <Toast>Offer declined. The seller has been told.</Toast>}
      <PageHeader title="Stock offers" />
      <FilterSelect
        action="/admin/offers"
        name="tab"
        label="Filter offers"
        value={answered ? "answered" : received ? "received" : ""}
        className="mb-4 flex w-full max-w-xs gap-2"
        options={[
          { value: "", label: `To review (${toReview})` },
          { value: "answered", label: "Answered" },
          { value: "received", label: `Received (${receivedCount})` },
        ]}
      />
      {offers.length === 0 ? (
        <EmptyState
          title={
            received
              ? "No stock received yet"
              : answered
                ? "No answered offers yet"
                : "No offers to review"
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {offers.map((o) => (
            <li key={o.id} className="relative rounded-xl border border-line p-3 hover:bg-muted/50">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/admin/offers/${o.id}`}
                  className="min-w-0 font-medium break-words after:absolute after:inset-0 after:rounded-xl"
                >
                  {o.name}
                </Link>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatLKR(o.seller.isBrand ? (o.offerPrice ?? 0) : o.amount)}
                  {o.seller.isBrand && (
                    <span className="text-xs font-normal text-subtle"> / gift</span>
                  )}
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-subtle">
                <span>{o.seller.company || o.seller.name}</span>
                <span>· {formatDateTime(o.createdAt)}</span>
                {answered &&
                  (o.receivedAt && !o.seller.isBrand ? (
                    <Badge tone="good">Received</Badge>
                  ) : (
                    <Badge tone={OFFER_STATUS[o.status].tone}>{OFFER_STATUS[o.status].label}</Badge>
                  ))}
              </p>
              {received && (
                <p className="mt-0.5 text-sm">
                  Received by {o.receivedBy?.name ?? "packing staff"} ·{" "}
                  {formatDateTime(o.receivedAt)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
