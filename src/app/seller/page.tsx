import type { Metadata } from "next";
import Link from "next/link";
import { Toast } from "@/components/toast";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";
import { factoryDashboard } from "@/server/factory-dashboard";
import { Rows } from "@/app/admin/list-bits";
import { pcs } from "./design-chart";
import { BrandDashboard } from "./brand-dashboard";
import { sweep } from "@/server/carts/service";

export const metadata: Metadata = { title: "My products" };

/**
 * The factory's home (product owner, 2026-11-03): its sales (pieces and value, by month), orders by
 * stage, each product's sales, sizes sold and stock left, and its ratings. Factories publish
 * listings themselves. Earlier (2026-10-19): the factory seller's home (product owner, 2026-10-19): an add button, their designs in our shop
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
  const d = await factoryDashboard(seller.id);
  const maxMonth = Math.max(1, ...d.months.map((m) => m.pieces));
  const stages: [keyof typeof d.orders, string][] = [
    ["toPack", "To pack"],
    ["awaitingPickup", "Awaiting pickup"],
    ["onTheWay", "On the way"],
    ["delivered", "Delivered"],
    ["failed", "Failed"],
  ];

  return (
    <>
      {done === "sent" && <Toast>Sent for review.</Toast>}
      <PageHeader
        title={me.company || seller.name}
        actions={
          <div className="flex items-center gap-3">
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

      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Pieces sold" value={pcs(d.pieces)} />
        <Tile label="Sales value" value={formatLKR(d.value)} />
        <Tile
          label="Rating"
          value={d.rating.average === null ? "No ratings yet" : `★ ${d.rating.average.toFixed(1)}`}
          note={d.rating.count ? `${d.rating.count} ratings` : undefined}
        />
        <Tile label="Orders to pack" value={String(d.orders.toPack)} />
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Pieces sold by month</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {d.months.map((m) => (
              <li key={m.month} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2">
                <span className="text-subtle tabular-nums">{monthLabel(m.month)}</span>
                <span className="h-3 rounded-r bg-muted">
                  <span
                    className="block h-3 rounded-r bg-accent"
                    style={{ width: `${(m.pieces / maxMonth) * 100}%` }}
                  />
                </span>
                <span className="tabular-nums">
                  {pcs(m.pieces)} · {formatLKR(m.value)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Orders</h2>
          <Rows rows={stages.map(([k, label]) => [label, d.orders[k]])} />
          {d.rating.recent.length > 0 && (
            <>
              <h2 className="mt-4 mb-2 font-semibold">Latest ratings</h2>
              <Rows rows={d.rating.recent.map((r) => [formatDate(r.createdAt), `${r.stars} ★`])} />
            </>
          )}
        </Card>
      </section>

      <h2 className="mb-2 font-semibold">Products</h2>
      {d.products.length === 0 ? (
        <EmptyState title="No products yet">
          <Link href="/seller/new" className="font-medium text-accent underline">
            Publish your first product
          </Link>
        </EmptyState>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {d.products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/seller/products/${p.id}`}
                className="block rounded-xl border border-line p-3 hover:bg-muted"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium break-words">{p.title}</p>
                  {p.status === "ARCHIVED" ? (
                    <Badge tone="bad">Hidden</Badge>
                  ) : p.stockLeft === 0 ? (
                    <Badge>No stock</Badge>
                  ) : (
                    <Badge tone="good">In shop</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm tabular-nums">
                  {formatLKR(p.price)} · {pcs(p.pieces)} sold · {formatLKR(p.value)}
                </p>
                <p className="mt-1 text-xs text-subtle tabular-nums">
                  Left:{" "}
                  {p.variants.length
                    ? p.variants
                        .map((v) => `${v.size}${v.colour ? ` ${v.colour}` : ""} ${v.available}`)
                        .join(" · ")
                    : "no sizes yet"}
                </p>
                {p.sizesSold.length > 0 && (
                  <p className="text-xs text-subtle tabular-nums">
                    Best sizes:{" "}
                    {p.sizesSold
                      .slice(0, 3)
                      .map(([s, n]) => `${s} (${n})`)
                      .join(" · ")}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card>
      <p className="text-xs text-subtle">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-subtle">{note}</p>}
    </Card>
  );
}

const monthLabel = (ym: string) =>
  new Date(`${ym}-15T00:00:00Z`).toLocaleDateString("en-LK", { month: "short", year: "2-digit" });
