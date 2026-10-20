import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { dailySales, salesStats } from "@/server/admin-queries";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { SalesChart } from "./sales-chart";

export const metadata: Metadata = { title: "Sales" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The admin's landing page (product owner, 2026-10-21): how the business is doing, nothing to act
 * on. Work waiting shows as counts on the tabs.
 */
export default async function AdminHome() {
  await requireAdmin();
  await sweep();
  const now = new Date();
  const [s, days] = await Promise.all([salesStats(now), dailySales(now, 14)]);
  const { today, week, month } = s.sales;
  const average = month.orders > 0 ? month.total.div(month.orders) : null;

  return (
    <>
      <PageHeader
        title="Sales"
        actions={
          <a
            href="/admin/export/orders?days=30"
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm hover:bg-muted sm:min-h-10"
          >
            Export CSV
          </a>
        }
      />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <Card>
          <dl className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
            {(
              [
                ["Today", formatLKR(today.total), plural(today.orders, "order")],
                ["7 days", formatLKR(week.total), plural(week.orders, "order")],
                ["30 days", formatLKR(month.total), plural(month.orders, "order")],
                ["Avg order", average ? formatLKR(average) : "—", "30 days"],
              ] as const
            ).map(([label, value, sub]) => (
              <div key={label} className="min-w-0 rounded-lg bg-muted px-2.5 py-2 sm:px-3">
                <dt className="text-xs text-subtle">{label}</dt>
                <dd className="text-base font-bold whitespace-nowrap sm:text-xl">{value}</dd>
                <dd className="text-xs text-subtle">{sub}</dd>
              </div>
            ))}
          </dl>
          <SalesChart days={days} />
        </Card>

        <aside className="flex min-w-0 flex-col gap-4 sm:gap-6">
          <Card>
            <h2 className="mb-2 font-semibold">Best sellers</h2>
            {s.bestSellers.length === 0 ? (
              <p className="text-sm text-subtle">None yet</p>
            ) : (
              <ol className="divide-y divide-line text-sm">
                {s.bestSellers.map(({ product, sold }, i) => (
                  <li key={product?.id ?? i} className="flex justify-between gap-3 py-2">
                    {product ? (
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="min-w-0 truncate hover:underline"
                      >
                        {product.title}
                      </Link>
                    ) : (
                      <span className="text-subtle">Deleted product</span>
                    )}
                    <span className="shrink-0 text-subtle">{plural(sold, "sold", "sold")}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card className="text-sm">
            <dl className="flex flex-col gap-2">
              <div className="flex justify-between gap-3">
                <dt className="text-subtle">In carts now</dt>
                <dd className="text-right">
                  <strong>{formatLKR(s.locked.total)}</strong> · {plural(s.locked.carts, "cart")}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-subtle">Buyers</dt>
                <dd className="text-right">
                  <strong>{s.customers}</strong> · {s.newCustomers} new this week
                </dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}
