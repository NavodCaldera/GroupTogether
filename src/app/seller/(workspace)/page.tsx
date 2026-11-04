import type { Metadata } from "next";
import Link from "next/link";
import { Toast } from "@/components/toast";
import { cx } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { db } from "@/server/db";
import { factoryHome } from "@/server/factory-dashboard";
import { canFactory, editsListings, factoryOf, seesMoney } from "@/lib/factory-roles";
import { BrandDashboard } from "@/app/seller/brand-dashboard";
import { pcs } from "@/app/seller/design-chart";
import {
  FactoryShell,
  Figure,
  SizeGrid,
  TONE_BORDER,
  Tape,
  Ticket,
} from "@/app/seller/factory-bits";

export const metadata: Metadata = { title: "Home" };

/** Alerts beyond this many are summed up in one line to Products. */
const SHOWN_ALERTS = 3;

/**
 * The factory's home, phone first (product owner, 2026-11-03): alerts, then one "Pack these"
 * ticket with every piece waiting to be packed by size, then this month's paid figures; all on a
 * 360px screen without scrolling. The six-month tape sits below. Every figure is paid orders only.
 * A luxury brand (2026-10-24) sees its brand dashboard instead.
 */
export default async function SellerHome({ searchParams }: PageProps<"/seller">) {
  const seller = await requireSeller();
  const search = await searchParams;
  const login = await db.user.findUniqueOrThrow({
    where: { id: seller.id },
    select: { id: true, isBrand: true, factoryId: true, factoryRole: true },
  });
  if (login.isBrand) {
    await sweep();
    return <BrandDashboard brandId={seller.id} search={search} />;
  }
  // Staff work for the factory account; only owners see money (2026-11-04).
  const { factoryId, factoryRole } = factoryOf(login);
  const money = seesMoney(factoryRole);
  const listings = editsListings(factoryRole);
  const [me, d] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: factoryId }, select: { company: true, name: true } }),
    factoryHome(factoryId),
  ]);
  // Each job sees only the alerts it can act on.
  d.alerts = d.alerts.filter((a) =>
    canFactory(factoryRole, a.href.startsWith("/seller/orders") ? "orders" : "products"),
  );
  const best = Math.max(1, ...d.months.map((m) => m.pieces));
  const more = d.alerts.length - SHOWN_ALERTS;

  return (
    <FactoryShell
      active="home"
      role={factoryRole}
      title={me.company || me.name}
      action={
        listings && (
          <Link
            href="/seller/new"
            className="inline-flex min-h-12 shrink-0 items-center rounded-md border-2 border-ink px-3 font-bold"
          >
            Add product
          </Link>
        )
      }
    >
      {search.done === "sent" && <Toast>Sent for review.</Toast>}

      <ul className="mb-4 flex flex-col gap-1.5" aria-label="Alerts">
        {d.alerts.length === 0 ? (
          <li className={cx("border-l-4 py-1 pl-3", TONE_BORDER.good)}>All good</li>
        ) : (
          <>
            {d.alerts.slice(0, SHOWN_ALERTS).map((a, i) => (
              <li key={i}>
                <Link
                  href={a.href}
                  className={cx(
                    "flex min-h-12 items-center border-l-4 bg-muted pl-3 underline-offset-2 hover:underline",
                    TONE_BORDER[a.tone],
                  )}
                >
                  {a.text}
                </Link>
              </li>
            ))}
            {more > 0 && (
              <li>
                <Link
                  href="/seller/products"
                  className="inline-flex min-h-11 items-center text-accent underline"
                >
                  {more} more {more === 1 ? "alert" : "alerts"} in Products
                </Link>
              </li>
            )}
          </>
        )}
      </ul>

      {d.toPack ? (
        <Link
          href={canFactory(factoryRole, "orders") ? "/seller/orders" : "/seller"}
          aria-label={`Orders to pack: ${d.toPack}`}
          className="block"
        >
          <Ticket
            tone="accent"
            className="mb-5"
            head={
              <>
                <span className="text-xl font-bold">Pack these</span>
                <span>
                  {d.toPack} {d.toPack === 1 ? "order" : "orders"}
                </span>
              </>
            }
            foot={<span className="font-bold text-accent underline">Open orders to pack</span>}
          >
            <SizeGrid grid={d.toPackGrid} />
          </Ticket>
        </Link>
      ) : (
        <Ticket className="mb-5">
          <p className="text-xl font-bold">No orders to pack</p>
          {d.lastPackedAt && (
            <p className="text-sm text-subtle">Last packed {formatDateTime(d.lastPackedAt)}</p>
          )}
        </Ticket>
      )}

      <section aria-labelledby="month" className="mb-8">
        <h2 id="month" className="mb-2 font-bold">
          This month, paid orders
        </h2>
        <div
          className={cx(
            "grid gap-3 border-y-2 border-ink py-3",
            money ? "grid-cols-[1fr_1.7fr_auto]" : "grid-cols-2",
          )}
        >
          <Figure label="Sold (paid)" value={pcs(d.month.pieces)} />
          {money && <Figure label="Sales (paid)" value={formatLKR(d.month.value)} />}
          <Figure label="Delivered" value={String(d.month.delivered)} />
        </div>
      </section>

      <section aria-labelledby="months" className="mb-6">
        <h2 id="months" className="mb-3 font-bold">
          Sold (paid), last six months
        </h2>
        <ul className="flex flex-col gap-3">
          {d.months.map((m) => (
            <li key={m.month} className="grid grid-cols-[3.25rem_1fr] items-center gap-x-2">
              <span className="text-sm text-subtle">{monthLabel(m.month)}</span>
              <Tape share={m.pieces / best} />
              <span />
              <span className="text-sm tabular-nums">
                {pcs(m.pieces)}
                {money && `, ${formatLKR(m.value)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {canFactory(factoryRole, "insights") && (
        <Link
          href="/seller/insights"
          className="inline-flex min-h-11 items-center font-bold text-accent underline"
        >
          See ratings and insights
        </Link>
      )}
    </FactoryShell>
  );
}

const monthLabel = (ym: string) =>
  new Date(`${ym}-15T00:00:00Z`).toLocaleDateString("en-LK", { month: "short", year: "2-digit" });
