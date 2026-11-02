import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatLKR, timeLeft } from "@/lib/format";
import { SLOW_DAYS } from "@/lib/stock-rules";
import { salesStats } from "@/server/admin-queries";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { stockDashboard } from "@/server/stock";
import { Table } from "./list-bits";
import { AgeBars, WeekBars, pcs } from "./stock-charts";

export const metadata: Metadata = { title: "Stock" };

const days = (n: number | null) =>
  n === null ? "—" : `${n.toLocaleString("en-LK")} ${n === 1 ? "day" : "days"}`;
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

/**
 * The admin's landing page (product owner, 2026-10-21): the goal is to empty the store fast and
 * make room for the next bulk. What is in the store, how old it is, how fast it leaves, the
 * oldest piles, lots, and carts about to hand stock back. Sales are one line at the bottom.
 */
export default async function AdminHome() {
  await requireAdmin("FACTORY");
  const now = new Date();
  await sweep(now);
  const [d, s] = await Promise.all([stockDashboard(now), salesStats(now)]);
  const { store } = d;
  const flowMax = Math.max(0, ...d.flow.map((w) => Math.max(w.in, w.out)));
  const lots = d.lots
    .filter((l) => l.inStore > 0)
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Stock"
        actions={
          <Link
            href="/admin/lots/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent sm:min-h-10"
          >
            Add lot
          </Link>
        }
      />

      <Card className="mb-4 sm:mb-6">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
          {(
            [
              [
                "In store",
                pcs(store.inStore),
                <span key="f" className={(store.fullPct ?? 0) > 100 ? "text-danger" : ""}>
                  {pct(store.fullPct)} of {pcs(store.capacity)}
                </span>,
              ],
              ["Avg age", days(store.averageAge), null],
              ["Out 7 days", pcs(d.out7), null],
              ["Clear in", days(d.clearInDays), null],
            ] as const
          ).map(([label, value, sub]) => (
            <div key={label} className="min-w-0 rounded-lg bg-muted px-2.5 py-2 sm:px-3">
              <dt className="text-xs text-subtle">{label}</dt>
              <dd className="text-base font-bold whitespace-nowrap sm:text-xl">{value}</dd>
              {sub && <dd className="text-xs text-subtle">{sub}</dd>}
            </div>
          ))}
        </dl>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {(
            [
              ["Free", store.free],
              ["In carts", store.inCarts],
              ["Paid, in store", store.paidWaiting],
              ["Not listed", store.unlisted],
              ["Room", store.room],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="flex gap-1.5">
              <dt className="text-subtle">{label}</dt>
              <dd className="font-medium">{pcs(n)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          <Card>
            <h2 className="mb-3 font-semibold">Age of stock</h2>
            <AgeBars bands={store.bands} />
          </Card>

          <Card>
            <div className="grid gap-6 sm:grid-cols-2">
              <WeekBars title="In" weeks={d.flow} field="in" max={flowMax} />
              <WeekBars title="Out" weeks={d.flow} field="out" max={flowMax} />
            </div>
          </Card>

          <section>
            <h2 className="mb-2 font-semibold">Oldest stock</h2>
            {d.oldest.length === 0 ? (
              <Card className="text-sm text-subtle">None</Card>
            ) : (
              <Table
                head={
                  <>
                    <th>Product</th>
                    <th className="text-right">Free</th>
                    <th className="text-right">Days</th>
                    <th className="text-right">Sold</th>
                    <th className="text-right">Price</th>
                    <th>Margin</th>
                  </>
                }
              >
                {d.oldest.map((p) => (
                  <tr key={p.id}>
                    <td className="max-w-56 truncate">
                      <Link href={`/admin/products/${p.id}`} className="hover:underline">
                        {p.brand} {p.title}
                      </Link>
                      {p.lot && <div className="truncate text-xs text-subtle">{p.lot.name}</div>}
                    </td>
                    <td className="text-right tabular-nums">{p.free}</td>
                    <td
                      className={`text-right tabular-nums ${p.days > SLOW_DAYS ? "font-semibold text-danger" : ""}`}
                    >
                      {p.days}
                    </td>
                    <td className="text-right tabular-nums">{pct(p.soldPct)}</td>
                    <td className="text-right">{formatLKR(p.price)}</td>
                    <td>
                      {p.marginPct === null ? (
                        <span className="text-subtle">—</span>
                      ) : (
                        <MarginBadge lot={p.lot!.id} pct={p.marginPct} />
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">Lots</h2>
              <Link href="/admin/lots" className="text-sm text-accent hover:underline">
                All →
              </Link>
            </div>
            {lots.length === 0 ? (
              <Card className="text-sm text-subtle">None</Card>
            ) : (
              <Table
                head={
                  <>
                    <th>Lot</th>
                    <th className="text-right">Days</th>
                    <th className="text-right">In store</th>
                    <th className="text-right">Sold</th>
                    <th className="text-right">Cost back</th>
                  </>
                }
              >
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td className="max-w-56 truncate">
                      <Link href={`/admin/lots/${l.id}`} className="hover:underline">
                        {l.name}
                      </Link>
                    </td>
                    <td
                      className={`text-right tabular-nums ${l.days > SLOW_DAYS ? "font-semibold text-danger" : ""}`}
                    >
                      {l.days}
                    </td>
                    <td className="text-right tabular-nums">{pcs(l.inStore)}</td>
                    <td className="text-right tabular-nums">{pct(l.soldPct)}</td>
                    <td className="text-right tabular-nums">{pct(l.costBackPct)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 sm:gap-6">
          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">Next lot</h2>
            <Rows
              rows={[
                ["Room", <strong key="r">{pcs(store.room)}</strong>],
                [
                  "Offers to review",
                  <Link key="o" href="/admin/offers" className="text-accent hover:underline">
                    {d.offersWaiting}
                  </Link>,
                ],
                ["Accepted, on the way", d.offersOnTheWay],
              ]}
            />
          </Card>

          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">Closing soon</h2>
            {d.closingSoon.length === 0 ? (
              <p className="text-subtle">None</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.closingSoon.map((c) => (
                  <li key={c.code} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <span className="font-mono font-medium">{c.code}</span>
                      <div className="text-xs text-subtle">
                        {formatLKR(c.short)} short · {pcs(c.pieces)}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-warn">{timeLeft(c.expiresAt, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">Odd sizes left</h2>
            {d.oddSizes.length === 0 ? (
              <p className="text-subtle">None</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.oddSizes.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 py-2">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="min-w-0 truncate hover:underline"
                    >
                      {p.brand} {p.title}
                    </Link>
                    <span className="shrink-0 text-subtle">{p.oddSizes!.join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">Carts, 30 days</h2>
            <Rows
              rows={[
                ["Paid", pcs(d.outcomes.paid)],
                [
                  "Back to the shelf",
                  `${pcs(d.outcomes.back)}${d.outcomes.backPct === null ? "" : ` · ${d.outcomes.backPct}%`}`,
                ],
                [
                  "Expired carts",
                  `${d.outcomes.expiredCarts}${d.outcomes.expiredReachedPct === null ? "" : ` · reached ${d.outcomes.expiredReachedPct}%`}`,
                ],
              ]}
            />
          </Card>

          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">Sales</h2>
            <Rows
              rows={[
                ["Today", formatLKR(s.sales.today.total)],
                ["7 days", formatLKR(s.sales.week.total)],
                ["30 days", formatLKR(s.sales.month.total)],
                ["In carts now", formatLKR(s.locked.total)],
              ]}
            />
          </Card>
        </aside>
      </div>
    </>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-col gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-subtle">{label}</dt>
          <dd className="text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MarginBadge({ lot, pct }: { lot: string; pct: number }) {
  return (
    <Link href={`/admin/lots/${lot}`}>
      <Badge tone="info">{pct}%</Badge>
    </Link>
  );
}
