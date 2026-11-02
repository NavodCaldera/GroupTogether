import type { Metadata } from "next";
import Link from "next/link";
import { Toast } from "@/components/toast";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { discountPct, siteName } from "@/lib/brand-rules";
import { formatDate, formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";
import { sellerDesigns } from "@/server/designs";
import { DesignCard } from "./design-bits";
import { BrandDashboard } from "./brand-dashboard";
import { sweep } from "@/server/carts/service";

export const metadata: Metadata = { title: "My products" };

const STATUS = {
  IN_REVIEW: { label: "Waiting for review", tone: "info" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "good" },
  DECLINED: { label: "Declined", tone: "bad" },
  /** Accepted, and our packing staff have confirmed the stock arrived (2026-10-20). */
  RECEIVED: { label: "Received", tone: "good" },
} as const;

/**
 * The factory seller's home (product owner, 2026-10-19): an add button, their designs in our shop
 * with how each sells (2026-10-24: pieces wanted and bought, how many people bought, never names,
 * carts or money), then the stock offers they have sent, newest first, with our answer.
 * A luxury brand (2026-10-24) sees its brand profile: its name and website, and each discounted
 * product it published with the actual price, the discount price, pieces and its link.
 */
export default async function SellerHome({ searchParams }: PageProps<"/seller">) {
  const seller = await requireSeller();
  const search = await searchParams;
  const { done } = search;
  const me = await db.user.findUniqueOrThrow({
    where: { id: seller.id },
    select: { isBrand: true, website: true, company: true },
  });
  if (me.isBrand) {
    await sweep();
    return <BrandDashboard brandId={seller.id} search={search} />;
  }
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
        title={me.isBrand ? me.company || seller.name : "My products"}
        description={
          me.isBrand && me.website ? (
            <a
              href={me.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              {siteName(me.website)} ↗
            </a>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href="/seller/orders" className="font-medium text-accent underline">
              Orders
            </Link>
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
          </div>
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
                {o.actualPrice && o.offerPrice ? (
                  <>
                    <p className="mt-0.5 text-sm tabular-nums">
                      <span className="text-subtle line-through">{formatLKR(o.actualPrice)}</span>{" "}
                      <span className="font-medium">{formatLKR(o.offerPrice)}</span>
                      {discountPct(o.actualPrice, o.offerPrice) !== null &&
                        ` · ${discountPct(o.actualPrice, o.offerPrice)}% off`}
                      {o.pieces !== null && ` · ${o.pieces} pcs`}
                    </p>
                    <p className="mt-0.5 text-xs text-subtle tabular-nums">
                      {formatLKR(o.amount)} · {formatDate(o.createdAt)}
                      {o.productUrl && (
                        <>
                          {" · "}
                          <a
                            href={o.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent underline"
                          >
                            {siteName(o.productUrl)} ↗
                          </a>
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="mt-0.5 text-sm text-subtle tabular-nums">
                    {formatLKR(o.amount)} · {formatDate(o.createdAt)}
                  </p>
                )}
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
