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
 * for the lot. "To review" (oldest first), "Answered", or "Received": every accepted offer whose
 * stock the packing staff marked Received, newest first (2026-10-20). Each opens the offer.
 */
export default async function OffersPage({ searchParams }: PageProps<"/admin/offers">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = param(sp, "tab");
  const answered = tab === "answered";
  const received = tab === "received";
  const done = param(sp, "done");
  const [offers, toReview, receivedCount] = await Promise.all([
    db.stockOffer.findMany({
      where: received
        ? { receivedAt: { not: null } }
        : answered
          ? { status: { not: "IN_REVIEW" } }
          : { status: "IN_REVIEW" },
      orderBy: received
        ? { receivedAt: "desc" }
        : answered
          ? { decidedAt: "desc" }
          : { createdAt: "asc" },
      take: 100,
      include: {
        seller: { select: { name: true, company: true } },
        receivedBy: { select: { name: true } },
      },
    }),
    db.stockOffer.count({ where: { status: "IN_REVIEW" } }),
    db.stockOffer.count({ where: { receivedAt: { not: null } } }),
  ]);

  return (
    <>
      {done === "accepted" && <Toast>Offer accepted. The seller has been told.</Toast>}
      {done === "declined" && <Toast>Offer declined. The seller has been told.</Toast>}
      <PageHeader title="Stock offers" />
      <ChipRow>
        <Chip href="/admin/offers" active={!answered && !received}>
          To review <Count n={toReview} />
        </Chip>
        <Chip href="/admin/offers?tab=answered" active={answered}>
          Answered
        </Chip>
        <Chip href="/admin/offers?tab=received" active={received}>
          Received <Count n={receivedCount} />
        </Chip>
      </ChipRow>
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
                <span className="shrink-0 font-semibold tabular-nums">{formatLKR(o.amount)}</span>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-subtle">
                <span>{o.seller.company || o.seller.name}</span>
                <span>· {formatDateTime(o.createdAt)}</span>
                {answered &&
                  (o.receivedAt ? (
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
