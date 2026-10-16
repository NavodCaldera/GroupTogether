import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/cart-bits";
import { Card, PageHeader } from "@/components/ui";
import { STATUS_LABEL, progress } from "@/lib/cart-rules";
import { formatDateTime, formatLKR, timeLeft } from "@/lib/format";
import { overviewStats } from "@/server/admin-queries";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHome() {
  await requireAdmin();
  await sweep();
  const now = new Date();
  const s = await overviewStats(now);

  const tiles: [string, number, string, boolean][] = [
    ["Slips to review", s.pendingSlips, "/admin/slips", true],
    ["Confirmed, to book PickMe", s.toBook, "/admin/deliveries", true],
    ["Awaiting owner's slip", s.count("AWAITING_SLIP"), "/admin/carts?status=AWAITING_SLIP", false],
    ["Reached minimum", s.count("READY"), "/admin/carts?status=READY", false],
    ["Open carts", s.count("OPEN"), "/admin/carts?status=OPEN", false],
    ["Seller products to review", s.productsToReview, "/admin/products?status=IN_REVIEW", true],
    ["Sizes with ≤ 2 left", s.lowStockCount, "/admin/products?stock=low", false],
  ];
  const { today, week, month } = s.sales;
  const average = month.orders > 0 ? month.total.div(month.orders) : null;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Deadlines are checked each time this page loads."
        actions={
          <a
            href="/admin/export/orders?days=30"
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm hover:bg-muted sm:min-h-10"
          >
            Export orders (CSV)
          </a>
        }
      />

      <Section title="Needs action">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {tiles.map(([label, n, href, urgent]) => (
            <Link key={label} href={href}>
              <Card
                className={`h-full hover:border-accent ${urgent && n > 0 ? "border-warn" : ""}`}
              >
                <p className={`text-3xl font-bold ${urgent && n > 0 ? "text-warn" : ""}`}>{n}</p>
                <p className="mt-1 text-sm text-subtle">{label}</p>
              </Card>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Confirmed sales">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label="Today" value={formatLKR(today.total)} note={orders(today.orders)} />
          <Stat label="Last 7 days" value={formatLKR(week.total)} note={orders(week.orders)} />
          <Stat label="Last 30 days" value={formatLKR(month.total)} note={orders(month.orders)} />
          <Stat
            label="Average order (30 days)"
            value={average ? formatLKR(average) : "—"}
            note="Whole cart, one slip"
          />
        </div>
        <p className="mt-3 text-sm text-subtle">
          {formatLKR(s.locked.total)} of stock is locked in {s.locked.carts} unpaid{" "}
          {s.locked.carts === 1 ? "cart" : "carts"} (open, minimum reached, awaiting or in review).
        </p>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <h2 className="mb-3 font-semibold">Slip windows running</h2>
          {s.slipsDue.length === 0 ? (
            <p className="text-sm text-subtle">No owner is due to upload a slip.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {s.slipsDue.map((c) => (
                <li key={c.code} className="flex items-center justify-between gap-3 py-2">
                  <CartLink code={c.code}>
                    {c.owner.name} · {formatLKR(c.total)}
                  </CartLink>
                  <span className="shrink-0 text-warn">
                    {c.slipDueAt ? timeLeft(c.slipDueAt, now) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mt-5 mb-3 font-semibold">Carts expiring in the next 6 hours</h2>
          {s.expiringSoon.length === 0 ? (
            <p className="text-sm text-subtle">None.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {s.expiringSoon.map((c) => (
                <li key={c.code} className="flex items-center justify-between gap-3 py-2">
                  <CartLink code={c.code}>
                    {c.name || "Unnamed"} ·{" "}
                    {Math.round(progress(c.total.toString(), c.minOrderValue.toString()) * 100)}% of
                    minimum
                  </CartLink>
                  <span className="shrink-0 text-warn">{timeLeft(c.expiresAt, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">Low stock (live products)</h2>
            <Link href="/admin/products?stock=low" className="text-xs text-accent underline">
              All
            </Link>
          </div>
          {s.lowStock.length === 0 ? (
            <p className="text-sm text-subtle">Every live size has more than 2 free.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr>
                  <th className="pb-1">Item</th>
                  <th className="pb-1 text-right">Free</th>
                  <th className="pb-1 text-right">In carts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {s.lowStock.map((v) => (
                  <tr key={`${v.product.id}-${v.size}-${v.colour}`}>
                    <td className="py-1.5">
                      <Link href={`/admin/products/${v.product.id}`} className="hover:underline">
                        {v.product.brand} {v.product.title}
                      </Link>
                      <span className="text-subtle">
                        {" "}
                        · {v.size}
                        {v.colour && ` · ${v.colour}`}
                      </span>
                    </td>
                    <td
                      className={`py-1.5 text-right font-medium ${v.available === 0 ? "text-danger" : ""}`}
                    >
                      {v.available}
                    </td>
                    <td className="py-1.5 text-right text-subtle">{v.reserved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Recent orders</h2>
          {s.recentOrders.length === 0 ? (
            <p className="text-sm text-subtle">No confirmed orders yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {s.recentOrders.map((c) => (
                <li key={c.code} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <CartLink code={c.code}>
                      {c.owner.name} · {formatLKR(c.total)}
                    </CartLink>
                    <p className="text-xs text-subtle">{formatDateTime(c.confirmedAt)}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Best sellers (units sold)</h2>
          {s.bestSellers.length === 0 ? (
            <p className="text-sm text-subtle">Nothing sold yet.</p>
          ) : (
            <ol className="divide-y divide-line text-sm">
              {s.bestSellers.map(({ product, sold }, i) => (
                <li key={product?.id ?? i} className="flex justify-between gap-3 py-2">
                  {product ? (
                    <Link href={`/admin/products/${product.id}`} className="hover:underline">
                      {product.brand} {product.title}
                    </Link>
                  ) : (
                    <span className="text-subtle">Deleted product</span>
                  )}
                  <span className="font-medium">{sold}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <p className="text-xs text-subtle">
        <Link href="/admin/users" className="underline">
          {s.customers} customers
        </Link>{" "}
        ({s.newCustomers} new this week) ·{" "}
        {(["DISPATCHED", "DELIVERED", "EXPIRED", "CANCELLED"] as const)
          .map((st) => `${STATUS_LABEL[st]}: ${s.count(st)}`)
          .join(" · ")}
      </p>
    </>
  );
}

const orders = (n: number) => `${n} ${n === 1 ? "order" : "orders"}`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-subtle uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card>
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-1 text-xl font-bold break-words sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-subtle">{note}</p>
    </Card>
  );
}

function CartLink({ code, children }: { code: string; children: ReactNode }) {
  return (
    <Link href={`/admin/carts/${code}`} className="block min-w-0 truncate hover:underline">
      <span className="font-mono text-accent">{code}</span> <span>{children}</span>
    </Link>
  );
}
