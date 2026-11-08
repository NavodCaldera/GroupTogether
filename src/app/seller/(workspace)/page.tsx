import type { Metadata } from "next";
import Link from "next/link";
import { Toast } from "@/components/toast";
import { cx } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { db } from "@/server/db";
import {
  factoryEarnings,
  fillingBaskets,
  packingWork,
  returnsWaiting,
  stockAlerts,
} from "@/server/factory-dashboard";
import { canFactory, editsListings, factoryOf } from "@/lib/factory-roles";
import { BrandDashboard } from "@/app/seller/brand-dashboard";
import { FactoryShell, TONE_BORDER, Tape } from "@/app/seller/factory-bits";
import { BasketTicket } from "./orders/basket-ticket";
import { EarningsSummary } from "./earnings/earnings-bits";

export const metadata: Metadata = { title: "Home" };

/** Stock alerts beyond this many are summed up in one line to Products. */
const SHOWN_ALERTS = 3;

const LINK = "inline-flex min-h-11 items-center font-bold text-accent underline underline-offset-2";

/**
 * The factory's home, phone first, by job (area-agent model): Packing gets To pack and Courier
 * booked; Sales gets Filling baskets, Returns and Products and stock; the Owner gets all of it
 * plus Earnings and payouts. A luxury brand (2026-10-24) sees its brand dashboard instead.
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
  const { factoryId, factoryRole: role } = factoryOf(login);
  const packs = canFactory(role, "orders");
  const owner = canFactory(role, "earnings");
  const [me, work, filling, returns, alerts, earnings] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: factoryId }, select: { company: true, name: true } }),
    packs ? packingWork(login.id) : null,
    canFactory(role, "baskets") || owner ? fillingBaskets(login.id) : null,
    canFactory(role, "returns") ? returnsWaiting(login.id) : null,
    canFactory(role, "products") ? stockAlerts(login.id) : null,
    owner ? factoryEarnings(login.id) : null,
  ]);
  const more = (alerts?.length ?? 0) - SHOWN_ALERTS;

  return (
    <FactoryShell
      active="home"
      role={role}
      title={me.company || me.name}
      action={
        editsListings(role) && (
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

      {work && (
        <>
          <section aria-labelledby="to-pack" className="mb-6">
            <h2 id="to-pack" className="mb-2 text-xl font-bold">
              To pack
            </h2>
            {work.toPack.length === 0 ? (
              <p className={cx("border-l-4 py-1 pl-3", TONE_BORDER.good)}>Nothing to pack</p>
            ) : (
              <ul aria-label="To pack" className="flex flex-col gap-4">
                {work.toPack.map((b) => (
                  <li key={b.id} aria-label={b.agent.user.name}>
                    <BasketTicket basket={b} money={false} packs />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="courier-booked" className="mb-6">
            <h2 id="courier-booked" className="mb-2 text-xl font-bold">
              Courier booked
            </h2>
            {work.courierBooked.length === 0 ? (
              <p className="border-l-4 border-l-line py-1 pl-3 text-subtle">
                {work.waitingCourier > 0 ? `Waiting for a courier: ${work.waitingCourier}` : "None"}
              </p>
            ) : (
              <ul aria-label="Courier booked" className="flex flex-col gap-4">
                {work.courierBooked.map((b) => (
                  <li key={b.id} aria-label={b.agent.user.name}>
                    <BasketTicket basket={b} money={false} packs />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {filling && (
        <section aria-labelledby="filling" className="mb-6">
          <h2 id="filling" className="mb-2 text-xl font-bold">
            Filling baskets
          </h2>
          {filling.baskets.length === 0 ? (
            <p className="border-l-4 border-l-line py-1 pl-3 text-subtle">None</p>
          ) : (
            <ul aria-label="Filling baskets" className="flex flex-col gap-3">
              {filling.baskets.map((b) => (
                <li
                  key={b.id}
                  aria-label={b.agent.user.name}
                  className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1"
                >
                  <span className="min-w-0">
                    <span className="block font-bold break-words">{b.agent.user.name}</span>
                    <span className="block text-sm text-subtle break-words">
                      {[b.agent.address, b.agent.city].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block font-bold">{formatLKR(b.total)}</span>
                    <span className="block text-sm text-subtle">
                      of {formatLKR(filling.lockAmount)}
                    </span>
                  </span>
                  <span className="col-span-2">
                    <Tape
                      share={
                        filling.lockAmount.gt(0)
                          ? Math.min(1, b.total.div(filling.lockAmount).toNumber())
                          : 1
                      }
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canFactory(role, "baskets") && filling.baskets.length > 0 && (
            <Link href="/seller/baskets" className={LINK}>
              Open filling baskets
            </Link>
          )}
        </section>
      )}

      {returns !== null && (
        <section aria-labelledby="returns" className="mb-6">
          <h2 id="returns" className="mb-2 text-xl font-bold">
            Returns
          </h2>
          <Link
            href="/seller/returns"
            className={cx(
              "flex min-h-12 items-center border-l-4 bg-muted pl-3 underline-offset-2 hover:underline",
              returns > 0 ? TONE_BORDER.warn : TONE_BORDER.good,
            )}
          >
            {returns > 0 ? `Waiting for your decision: ${returns}` : "No returns waiting"}
          </Link>
        </section>
      )}

      {alerts && (
        <section aria-labelledby="stock" className="mb-6">
          <h2 id="stock" className="mb-2 text-xl font-bold">
            Products and stock
          </h2>
          <ul className="flex flex-col gap-1.5" aria-label="Stock alerts">
            {alerts.length === 0 ? (
              <li className={cx("border-l-4 py-1 pl-3", TONE_BORDER.good)}>All in stock</li>
            ) : (
              alerts.slice(0, SHOWN_ALERTS).map((a, i) => (
                <li key={i}>
                  <Link
                    href={`/seller/products#p-${a.productId}`}
                    className={cx(
                      "flex min-h-12 items-center border-l-4 bg-muted pl-3 underline-offset-2 hover:underline",
                      TONE_BORDER[a.tone],
                    )}
                  >
                    {a.text}
                  </Link>
                </li>
              ))
            )}
          </ul>
          <Link href="/seller/products" className={LINK}>
            {more > 0 ? `${more} more in Products` : "Open products"}
          </Link>
        </section>
      )}

      {earnings && (
        <section aria-labelledby="earnings" className="mb-6">
          <h2 id="earnings" className="mb-2 text-xl font-bold">
            Earnings and payouts
          </h2>
          <EarningsSummary e={earnings} />
          <Link href="/seller/earnings" className={LINK}>
            Past payouts
          </Link>
        </section>
      )}
    </FactoryShell>
  );
}
