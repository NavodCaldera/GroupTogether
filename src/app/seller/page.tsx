import type { Metadata } from "next";
import Link from "next/link";
import { Toast } from "@/components/toast";
import { Card, PageHeader, cx } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { db } from "@/server/db";
import { factoryHome } from "@/server/factory-dashboard";
import { BrandDashboard } from "./brand-dashboard";
import { pcs } from "./design-chart";
import { FactoryNav, Figure, TONE_BORDER } from "./factory-bits";

export const metadata: Metadata = { title: "Home" };

/** Alerts beyond this many are summed up in one line to Products. */
const SHOWN_ALERTS = 3;

/**
 * The factory's home, phone first (product owner, 2026-11-03): alerts, the orders to pack, and
 * this month's paid figures fit a 360px screen without scrolling; the six-month chart sits below.
 * Every figure is paid orders only; unpaid carts are never counted as sales.
 * A luxury brand (2026-10-24) sees its brand dashboard instead.
 */
export default async function SellerHome({ searchParams }: PageProps<"/seller">) {
  const seller = await requireSeller();
  const search = await searchParams;
  const me = await db.user.findUniqueOrThrow({
    where: { id: seller.id },
    select: { isBrand: true, company: true },
  });
  if (me.isBrand) {
    await sweep();
    return <BrandDashboard brandId={seller.id} search={search} />;
  }
  const d = await factoryHome(seller.id);
  const maxMonth = Math.max(1, ...d.months.map((m) => m.pieces));
  const more = d.alerts.length - SHOWN_ALERTS;

  return (
    <>
      {search.done === "sent" && <Toast>Sent for review.</Toast>}
      <PageHeader
        title={me.company || seller.name}
        actions={
          <Link
            href="/seller/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent"
          >
            + Product
          </Link>
        }
      />
      <FactoryNav active="home" />

      <ul className="mb-3 flex flex-col gap-1.5" aria-label="Alerts">
        {d.alerts.length === 0 ? (
          <li
            className={cx(
              "rounded-lg border border-line border-l-4 p-2.5 text-sm",
              TONE_BORDER.good,
            )}
          >
            All good
          </li>
        ) : (
          <>
            {d.alerts.slice(0, SHOWN_ALERTS).map((a, i) => (
              <li key={i}>
                <Link
                  href={a.href}
                  className={cx(
                    "flex min-h-11 items-center rounded-lg border border-line border-l-4 px-2.5 text-sm hover:bg-muted",
                    TONE_BORDER[a.tone],
                  )}
                >
                  {a.text}
                </Link>
              </li>
            ))}
            {more > 0 && (
              <li>
                <Link href="/seller/products" className="text-sm text-accent underline">
                  {more} more {more === 1 ? "alert" : "alerts"}
                </Link>
              </li>
            )}
          </>
        )}
      </ul>

      <Link
        href="/seller/orders"
        className={cx(
          "mb-3 block rounded-xl p-4",
          d.toPack ? "bg-accent text-on-accent" : "border border-line hover:bg-muted",
        )}
      >
        <p className="text-xl font-semibold">
          {d.toPack ? `Orders to pack: ${d.toPack}` : "No orders to pack"}
        </p>
        {!d.toPack && d.lastPackedAt && (
          <p className="text-sm text-subtle">Last packed {formatDateTime(d.lastPackedAt)}</p>
        )}
      </Link>

      <section aria-label="This month" className="mb-6">
        <h2 className="mb-1.5 text-sm font-medium">This month · paid orders</h2>
        <div className="grid grid-cols-3 gap-2">
          <Figure label="Sold (paid)" value={pcs(d.month.pieces)} />
          <Figure label="Sales (paid)" value={formatLKR(d.month.value)} />
          <Figure label="Delivered" value={String(d.month.delivered)} />
        </div>
      </section>

      <Card className="mb-4">
        <h2 className="mb-3 font-semibold">Sold (paid) by month</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {d.months.map((m) => (
            <li key={m.month} className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
              <span className="text-subtle tabular-nums">{monthLabel(m.month)}</span>
              <span>
                <span className="block h-3 rounded-r bg-muted">
                  <span
                    className="block h-3 rounded-r bg-accent"
                    style={{ width: `${(m.pieces / maxMonth) * 100}%` }}
                  />
                </span>
                <span className="tabular-nums">
                  {pcs(m.pieces)} · {formatLKR(m.value)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Link href="/seller/insights" className="font-medium text-accent underline">
        Ratings and insights
      </Link>
    </>
  );
}

const monthLabel = (ym: string) =>
  new Date(`${ym}-15T00:00:00Z`).toLocaleDateString("en-LK", { month: "short", year: "2-digit" });
