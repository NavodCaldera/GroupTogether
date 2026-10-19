import type { Metadata } from "next";
import Link from "next/link";
import { Toast } from "@/components/toast";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "My products" };

const STATUS = {
  IN_REVIEW: { label: "Waiting for review", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "good" },
  DECLINED: { label: "Declined", tone: "bad" },
  /** Accepted, and our packing staff have confirmed the stock arrived (2026-10-20). */
  RECEIVED: { label: "Received", tone: "good" },
} as const;

/**
 * The factory seller's home (product owner, 2026-10-19): an add button and the stock offers they
 * have sent, newest first, each with its total price and our answer. Nothing else: sellers never
 * see buyers, carts or money (rule 11).
 */
export default async function SellerHome({ searchParams }: PageProps<"/seller">) {
  const seller = await requireSeller();
  const { done } = await searchParams;
  const offers = await db.stockOffer.findMany({
    where: { sellerId: seller.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      {done === "sent" && <Toast>Sent for review.</Toast>}
      <PageHeader
        title="My products"
        actions={
          <Link
            href="/seller/new"
            aria-label="Add product"
            title="Add product"
            className="grid size-12 place-items-center rounded-full bg-accent text-on-accent hover:opacity-90"
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        }
      />

      {offers.length === 0 ? (
        <EmptyState title="Nothing sent yet">
          <Link href="/seller/new" className="font-medium text-accent underline">
            Add your first product
          </Link>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {offers.map((o) => {
            const st = STATUS[o.receivedAt ? "RECEIVED" : o.status];
            return (
              <li key={o.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium break-words">{o.name}</p>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-subtle tabular-nums">
                  {formatLKR(o.amount)} · {formatDate(o.createdAt)}
                </p>
                {o.note && <p className="mt-1 text-sm">{o.note}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
