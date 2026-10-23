import type { Metadata } from "next";
import Link from "next/link";
import { Toast } from "@/components/toast";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";
import { sellerDesigns } from "@/server/designs";
import { DesignCard } from "./design-bits";

export const metadata: Metadata = { title: "My products" };

const STATUS = {
  IN_REVIEW: { label: "Waiting for review", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "good" },
  DECLINED: { label: "Declined", tone: "bad" },
  /** Accepted, and our packing staff have confirmed the stock arrived (2026-10-20). */
  RECEIVED: { label: "Received", tone: "good" },
} as const;

/**
 * The factory seller's home (product owner, 2026-10-19): an add button, their designs in our shop
 * with how each sells (2026-10-24: pieces wanted and bought, how many people bought, never names,
 * carts or money), then the stock offers they have sent, newest first, with our answer.
 */
export default async function SellerHome({ searchParams }: PageProps<"/seller">) {
  const seller = await requireSeller();
  const { done } = await searchParams;
  const [designs, offers] = await Promise.all([
    sellerDesigns(seller.id),
    db.stockOffer.findMany({
      where: { sellerId: seller.id },
      orderBy: { createdAt: "desc" },
      include: { product: { select: { id: true, title: true } } },
    }),
  ]);

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

      {designs.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">Designs</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {designs.map((d) => (
              <li key={d.id}>
                <DesignCard d={d} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {designs.length > 0 && offers.length > 0 && <h2 className="mb-2 font-semibold">Offers</h2>}
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
                  <div className="flex gap-1">
                    {o.kind === "TEST" && <Badge tone="info">Test pieces</Badge>}
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                </div>
                <p className="mt-0.5 text-sm text-subtle tabular-nums">
                  {formatLKR(o.amount)} · {formatDate(o.createdAt)}
                </p>
                {o.note && <p className="mt-1 text-sm">{o.note}</p>}
                {o.product && (
                  <Link
                    href={`/seller/designs/${o.product.id}`}
                    className="mt-1 inline-block text-sm text-accent underline"
                  >
                    {o.product.title}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
