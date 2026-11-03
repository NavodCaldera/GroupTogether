import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { MIN_CITY_ORDERS, MIN_RATINGS, PRICE_BANDS } from "@/lib/factory-insights";
import { requireSeller } from "@/server/auth/session";
import { factoryInsights } from "@/server/factory-dashboard";
import { Table } from "@/app/admin/list-bits";
import { FactoryNav } from "../factory-bits";

export const metadata: Metadata = { title: "Ratings and insights" };

/**
 * Ratings and insights for a factory (product owner, 2026-11-03): its rating (the average only
 * from 5 ratings, always with the count), restock advice, how long it takes to pack, demand in
 * carts not yet paid, pieces sold by price band, and paid orders by city (cities under 5 orders
 * hidden). Tables and plain numbers only.
 */
export default async function FactoryInsightsPage() {
  const seller = await requireSeller();
  const d = await factoryInsights(seller.id);
  const hours = d.packTime.medianHours;
  return (
    <>
      <PageHeader title="Ratings and insights" />
      <FactoryNav active="insights" />
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-1 font-semibold">Your rating</h2>
          {d.rating.average === null ? (
            <p className="text-sm">
              Not enough ratings yet ({d.rating.count} of {MIN_RATINGS})
            </p>
          ) : (
            <p className="text-2xl font-semibold tabular-nums">
              ★ {d.rating.average.toFixed(1)}{" "}
              <span className="text-base font-normal text-subtle">
                from {d.rating.count} ratings
              </span>
            </p>
          )}
          {d.rating.latest.length > 0 && (
            <ul aria-label="Latest ratings" className="mt-2 flex flex-wrap gap-1.5 text-sm">
              {d.rating.latest.map((r) => (
                <li key={r.id} className="rounded-lg border border-line px-2 py-1 tabular-nums">
                  {r.stars} ★
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Restock</h2>
          {d.restock.length === 0 ? (
            <p className="text-sm">All sizes have enough stock</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {d.restock.map((r, i) => (
                <li key={i}>
                  <span className="font-medium">{r.product}</span>
                  <span className="block text-subtle">{r.advice}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Time to pack</h2>
          {hours === null ? (
            <p className="text-sm">No packed orders yet</p>
          ) : (
            <p className="text-sm">
              <span className="text-xl font-semibold tabular-nums">
                {hours < 24 ? `${Math.round(hours)} h` : `${(hours / 24).toFixed(1)} days`}
              </span>{" "}
              middle time from payment to packed, over {d.packTime.sample}{" "}
              {d.packTime.sample === 1 ? "order" : "orders"}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Wanted in active carts</h2>
          <p className="mb-2 text-xs text-subtle">Carts not paid yet. These are not sales.</p>
          {d.demand.length === 0 ? (
            <p className="text-sm">No active carts with your products</p>
          ) : (
            <Table
              head={
                <>
                  <th className="p-2">Product</th>
                  <th className="p-2 text-right">Carts</th>
                  <th className="p-2 text-right">To minimum</th>
                </>
              }
            >
              {d.demand.map((r) => (
                <tr key={r.product} className="border-t border-line">
                  <td className="p-2">{r.product}</td>
                  <td className="p-2 text-right tabular-nums">{r.carts}</td>
                  <td className="p-2 text-right tabular-nums">{r.averagePct}%</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Sold (paid) by price</h2>
          {d.priceBands.length === 0 ? (
            <EmptyState title="No sales yet" />
          ) : (
            <div className="overflow-x-auto">
              <Table
                head={
                  <>
                    <th className="p-2">Category</th>
                    {PRICE_BANDS.map((b) => (
                      <th key={b.label} className="p-2 text-right whitespace-nowrap">
                        {b.label}
                      </th>
                    ))}
                  </>
                }
              >
                {d.priceBands.map((r) => (
                  <tr key={r.category} className="border-t border-line">
                    <td className="p-2">{r.category}</td>
                    {PRICE_BANDS.map((b) => (
                      <td key={b.label} className="p-2 text-right tabular-nums">
                        {r.pieces[b.label] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Paid orders by city</h2>
          <p className="mb-2 text-xs text-subtle">
            Only cities with {MIN_CITY_ORDERS} or more orders
          </p>
          {d.cities.length === 0 ? (
            <p className="text-sm">No city has {MIN_CITY_ORDERS} orders yet</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {d.cities.map((c) => (
                <li key={c.city} className="flex justify-between">
                  <span>{c.city}</span>
                  <span className="tabular-nums">{c.orders}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
