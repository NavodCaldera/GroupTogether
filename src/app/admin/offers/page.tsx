import type { Metadata } from "next";
import Link from "next/link";
import { Toast } from "@/components/toast";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { Chip, ChipRow, Count, param } from "../list-bits";
import { OFFER_STATUS } from "./offer-status";

export const metadata: Metadata = { title: "Stock offers" };

/**
 * Factory sellers' stock offers (product owner, 2026-10-19): name, details and the total price
 * for the lot. "To review" (oldest first) or "Answered"; each opens to Accept or Decline.
 */
export default async function OffersPage({ searchParams }: PageProps<"/admin/offers">) {
  await requireAdmin();
  const sp = await searchParams;
  const answered = param(sp, "tab") === "answered";
  const done = param(sp, "done");
  const [offers, toReview] = await Promise.all([
    db.stockOffer.findMany({
      where: answered ? { status: { not: "IN_REVIEW" } } : { status: "IN_REVIEW" },
      orderBy: answered ? { decidedAt: "desc" } : { createdAt: "asc" },
      take: 100,
      include: { seller: { select: { name: true, company: true } } },
    }),
    db.stockOffer.count({ where: { status: "IN_REVIEW" } }),
  ]);

  return (
    <>
      {done === "accepted" && <Toast>Offer accepted. The seller has been told.</Toast>}
      {done === "declined" && <Toast>Offer declined. The seller has been told.</Toast>}
      <PageHeader title="Stock offers" />
      <ChipRow>
        <Chip href="/admin/offers" active={!answered}>
          To review <Count n={toReview} />
        </Chip>
        <Chip href="/admin/offers?tab=answered" active={answered}>
          Answered
        </Chip>
      </ChipRow>
      {offers.length === 0 ? (
        <EmptyState title={answered ? "No answered offers yet" : "No offers to review"} />
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
                <span className="shrink-0 font-semibold tabular-nums">{formatLKR(o.amount)}</span>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-subtle">
                <span>{o.seller.company || o.seller.name}</span>
                <span>· {formatDateTime(o.createdAt)}</span>
                {answered && (
                  <Badge tone={OFFER_STATUS[o.status].tone}>{OFFER_STATUS[o.status].label}</Badge>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
