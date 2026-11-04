import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/cart-bits";
import { BackLink } from "@/components/client";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import type { Demand } from "@/lib/design-rules";
import { formatDate, formatLKR } from "@/lib/format";
import { requireFactory } from "@/server/auth/session";
import { designInsight } from "@/server/designs";
import { DemandBadge } from "../../design-bits";
import { PriceQuantityChart, pcs } from "../../design-chart";

export const metadata: Metadata = { title: "Design" };

/**
 * One of the factory's designs (product owner, 2026-10-24): how it sells in our shop. Counts only
 * (pieces wanted and bought, how many people bought), the shop price against pieces sold, sizes,
 * and the test against the bulk. Never buyer names, carts, our cost or margin.
 */
export default async function DesignPage({ params }: PageProps<"/seller/designs/[id]">) {
  const seller = await requireFactory("products");
  const { id } = await params;
  const d = await designInsight(seller.factoryId, id);
  if (!d) notFound();
  const boughtTotal = d.sizes.reduce((n, s) => n + s.bought, 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <BackLink fallback="/seller" />
        <div className="flex items-start gap-3">
          <div className="w-16 shrink-0">
            <ProductImage
              photoKey={d.photoKey}
              id={d.id}
              title={d.title}
              category={d.category}
              className="text-2xl"
            />
          </div>
          <div className="min-w-0 flex-1">
            <PageHeader
              title={d.title}
              description={[d.kindLabel, formatLKR(d.price)].filter(Boolean).join(" · ")}
              actions={<DemandBadge label={d.label} />}
            />
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Wanted" value={pcs(d.demand.wanted)} />
        <Tile label="Bought" value={pcs(d.demand.bought)} />
        <Tile label="People" value={d.demand.people.toLocaleString("en-LK")} />
        <Tile label="Sold" value={d.soldPct === null ? "—" : `${d.soldPct}%`} />
      </dl>
      <p className="text-sm text-subtle tabular-nums">
        {d.daysOnSale} {d.daysOnSale === 1 ? "day" : "days"} · {d.rate} pcs a day
        {d.similar !== null && ` · similar designs ${d.similar} pcs a day`}
      </p>

      <Card>
        <h2 className="mb-3 font-semibold">Price and pieces</h2>
        <PriceQuantityChart days={d.chart} />
      </Card>

      {d.byPrice.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">At each price</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-subtle">
                <tr>
                  <th className="py-1 pr-2 text-left font-normal">Price</th>
                  <th className="px-2 py-1 text-right font-normal">Wanted</th>
                  <th className="px-2 py-1 text-right font-normal">Bought</th>
                  <th className="px-2 py-1 text-right font-normal">People</th>
                  <th className="py-1 pl-2 text-right font-normal">A day</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.byPrice.map((r) => {
                  const now = r.price.eq(d.price);
                  return (
                    <tr key={r.price.toFixed(2)} className={now ? "font-semibold" : ""}>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          {formatLKR(r.price)}
                          {now && <Badge tone="info">Now</Badge>}
                        </span>
                        {r.days > 0 && (
                          <span className="block text-xs font-normal text-subtle">
                            {r.days} {r.days === 1 ? "day" : "days"}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">{r.wanted}</td>
                      <td className="px-2 py-1.5 text-right">{r.bought}</td>
                      <td className="px-2 py-1.5 text-right">{r.people}</td>
                      <td className="py-1.5 pl-2 text-right">{r.perDay ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold">Sizes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-subtle">
              <tr>
                <th className="py-1 pr-2 text-left font-normal">Size</th>
                <th className="px-2 py-1 text-left font-normal">Share bought</th>
                <th className="px-2 py-1 text-right font-normal">Wanted</th>
                <th className="px-2 py-1 text-right font-normal">Bought</th>
                <th className="py-1 pl-2 text-right font-normal">Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.sizes.map((s) => {
                const share = boughtTotal > 0 ? Math.round((s.bought / boughtTotal) * 100) : 0;
                return (
                  <tr key={s.label}>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{s.label}</td>
                    <td className="w-full min-w-24 px-2 py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="h-3 flex-1" aria-hidden>
                          <span
                            className="block h-full rounded-r-[4px] bg-chart"
                            style={{ width: share > 0 ? `max(2px, ${share}%)` : 0 }}
                          />
                        </span>
                        <span className="w-9 text-right text-xs">{share}%</span>
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right">{s.wanted}</td>
                    <td className="px-2 py-1.5 text-right">{s.bought}</td>
                    <td className="py-1.5 pl-2 text-right">
                      {s.left === 0 && s.inCarts === 0 && s.bought > 0 ? (
                        <Badge tone="neutral">Sold out</Badge>
                      ) : (
                        s.left
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {d.test && (
        <Card>
          <h2 className="mb-3 font-semibold">Test and bulk</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Split title="Test" demand={d.test} />
            {d.bulk ? (
              <Split title={`Bulk · from ${formatDate(d.bulk.from)}`} demand={d.bulk} />
            ) : d.bulkOffered ? (
              <Split title="Bulk" />
            ) : (
              <LinkButton href={`/seller/new?design=${d.id}`} className="self-start">
                Offer the bulk
              </LinkButton>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Split({ title, demand }: { title: string; demand?: Demand }) {
  return (
    <div className="rounded-lg bg-muted p-3 text-sm">
      <p className="mb-1 font-medium">{title}</p>
      {demand ? (
        <p className="tabular-nums">
          {pcs(demand.wanted)} wanted · {pcs(demand.bought)} bought · {demand.people}{" "}
          {demand.people === 1 ? "person" : "people"}
        </p>
      ) : (
        <p className="text-subtle">Waiting for review</p>
      )}
    </div>
  );
}
