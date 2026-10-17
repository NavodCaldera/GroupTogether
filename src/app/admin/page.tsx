import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/cart-bits";
import { Card, PageHeader } from "@/components/ui";
import { STATUS_LABEL, progress } from "@/lib/cart-rules";
import { formatDateTime, formatLKR, timeLeft } from "@/lib/format";
import { dailySales, overviewStats } from "@/server/admin-queries";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { SalesChart } from "./sales-chart";

export const metadata: Metadata = { title: "Admin" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Phones: one column, most urgent first: what needs you (with deadlines), sales, then lists.
 * Desktop: the same cards in two columns: work and sales on the left, lists on the right.
 */
export default async function AdminHome() {
  await requireAdmin();
  await sweep();
  const now = new Date();
  const [s, days] = await Promise.all([overviewStats(now), dailySales(now, 14)]);

  // Only what needs someone shows up; zeros stay out of the way.
  const todo: { n: number; text: string; href: string; urgent?: boolean }[] = [
    {
      n: s.pendingSlips,
      text: s.pendingSlips === 1 ? "bank slip to review" : "bank slips to review",
      href: "/admin/slips",
      urgent: true,
    },
    {
      n: s.toBook,
      text:
        s.toBook === 1
          ? "confirmed cart to book with PickMe"
          : "confirmed carts to book with PickMe",
      href: "/admin/deliveries",
      urgent: true,
    },
    {
      n: s.productsToReview,
      text: s.productsToReview === 1 ? "seller product to review" : "seller products to review",
      href: "/admin/products?status=IN_REVIEW",
      urgent: true,
    },
    {
      n: s.lowStockCount,
      text: s.lowStockCount === 1 ? "size with 2 or fewer left" : "sizes with 2 or fewer left",
      href: "/admin/products?stock=low",
    },
  ].filter((t) => t.n > 0);
  const deadlines = s.slipsDue.length + s.expiringSoon.length;
  const pipeline = (["OPEN", "READY", "AWAITING_SLIP", "SLIP_REVIEW"] as const).map((st) => ({
    label: STATUS_LABEL[st],
    n: s.count(st),
    href: `/admin/carts?status=${st}`,
  }));
  const { today, week, month } = s.sales;
  const average = month.orders > 0 ? month.total.div(month.orders) : null;

  return (
    <>
      <PageHeader
        title="Overview"
        actions={
          <a
            href="/admin/export/orders?days=30"
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline sm:min-h-9"
          >
            Export orders (CSV)
          </a>
        }
      />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          {/* What needs someone now, then the deadlines that are running. */}
          <section className="rounded-xl border border-line bg-paper">
            <h2 className="px-4 pt-4 font-semibold sm:px-5 sm:pt-5">To do</h2>
            {todo.length === 0 && deadlines === 0 ? (
              <p className="px-4 pt-1 pb-4 text-sm text-subtle sm:px-5 sm:pb-5">
                All clear. Nothing needs you right now.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line border-t border-line">
                {todo.map((t) => (
                  <li key={t.href}>
                    <Row href={t.href}>
                      <span className="min-w-0">
                        <strong className={t.urgent ? "text-accent" : ""}>{t.n}</strong> {t.text}
                      </span>
                    </Row>
                  </li>
                ))}
                {s.slipsDue.map((c) => (
                  <li key={`slip-${c.code}`}>
                    <Row
                      href={`/admin/carts/${c.code}`}
                      right={c.slipDueAt && timeLeft(c.slipDueAt, now)}
                    >
                      <span className="min-w-0 truncate">
                        Slip due · {c.owner.name} · {formatLKR(c.total)}
                      </span>
                    </Row>
                  </li>
                ))}
                {s.expiringSoon.map((c) => (
                  <li key={`exp-${c.code}`}>
                    <Row href={`/admin/carts/${c.code}`} right={timeLeft(c.expiresAt, now)}>
                      <span className="min-w-0 truncate">
                        Expiring · {c.name || c.code} ·{" "}
                        {Math.round(progress(c.total.toString(), c.minOrderValue.toString()) * 100)}
                        %
                      </span>
                    </Row>
                  </li>
                ))}
              </ul>
            )}
            {/* The carts still in play, one line. */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-sm sm:px-5">
              {pipeline.map((p) => (
                <Link key={p.href} href={p.href} className="text-subtle hover:text-ink">
                  {p.label} <strong className="text-ink">{p.n}</strong>
                </Link>
              ))}
            </div>
          </section>

          <Card>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">Confirmed sales</h2>
              {average && (
                <span className="text-xs text-subtle">Avg order {formatLKR(average)}</span>
              )}
            </div>
            <dl className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">
              {(
                [
                  ["Today", today],
                  ["7 days", week],
                  ["30 days", month],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="min-w-0 rounded-lg bg-muted px-2.5 py-2 sm:px-3">
                  <dt className="text-xs text-subtle">{label}</dt>
                  <dd className="text-sm font-bold whitespace-nowrap sm:text-xl">
                    {formatLKR(v.total)}
                  </dd>
                  <dd className="text-xs text-subtle">{plural(v.orders, "order")}</dd>
                </div>
              ))}
            </dl>
            <SalesChart days={days} />
            <p className="mt-3 text-xs text-subtle">
              {formatLKR(s.locked.total)} locked in {plural(s.locked.carts, "unpaid cart")}.
            </p>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 sm:gap-6">
          <Card>
            <h2 className="mb-2 font-semibold">Recent orders</h2>
            {s.recentOrders.length === 0 ? (
              <p className="text-sm text-subtle">No confirmed orders yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {s.recentOrders.map((c) => (
                  <li key={c.code}>
                    <Link
                      href={`/admin/carts/${c.code}`}
                      className="flex items-center justify-between gap-3 py-2 hover:underline"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{c.owner.name}</span>
                        <span className="block text-xs text-subtle">
                          {formatLKR(c.total)} · {formatDateTime(c.confirmedAt)}
                        </span>
                      </span>
                      <StatusBadge status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">Low stock</h2>
              <Link href="/admin/products?stock=low" className="text-xs text-accent">
                All →
              </Link>
            </div>
            {s.lowStock.length === 0 ? (
              <p className="text-sm text-subtle">Every live size has more than 2 free.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {s.lowStock.map((v) => (
                  <li key={`${v.product.id}-${v.size}-${v.colour}`}>
                    <Link
                      href={`/admin/products/${v.product.id}`}
                      className="flex items-center justify-between gap-3 py-2 hover:underline"
                    >
                      <span className="min-w-0 truncate">
                        {v.product.title}
                        <span className="text-subtle">
                          {" "}
                          · {v.size}
                          {v.colour && ` · ${v.colour}`}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 font-medium ${v.available === 0 ? "text-danger" : ""}`}
                      >
                        {v.available} left
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold">Best sellers</h2>
            {s.bestSellers.length === 0 ? (
              <p className="text-sm text-subtle">Nothing sold yet.</p>
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

          <p className="text-xs text-subtle">
            <Link href="/admin/users" className="underline">
              {plural(s.customers, "buyer")}
            </Link>{" "}
            ({s.newCustomers} new this week) · Delivered {s.count("DELIVERED")} · Expired{" "}
            {s.count("EXPIRED")} · Cancelled {s.count("CANCELLED")}
          </p>
        </aside>
      </div>
    </>
  );
}

/** A tappable to-do line: 48px tall, text left, optional amber time right, then a chevron. */
function Row({ href, right, children }: { href: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center justify-between gap-3 px-4 text-sm hover:bg-muted sm:px-5"
    >
      {children}
      <span className="flex shrink-0 items-center gap-2">
        {right && <span className="font-medium text-warn">{right}</span>}
        <span aria-hidden className="text-subtle">
          ›
        </span>
      </span>
    </Link>
  );
}
