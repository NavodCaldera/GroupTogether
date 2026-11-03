import type { Metadata } from "next";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { type FactoryStage, STAGES, factoryOrderBoard } from "@/server/factory-dashboard";
import { FactoryNav } from "../factory-bits";
import { MarkPacked } from "./mark-packed";

export const metadata: Metadata = { title: "Orders" };

const TONE: Record<FactoryStage, "good" | "bad" | "info" | "neutral"> = {
  toPack: "info",
  awaitingPickup: "neutral",
  onTheWay: "neutral",
  delivered: "good",
  failed: "bad",
};

const DELIVERY: Record<string, string> = {
  BOOKED: "PickMe booked",
  PICKED_UP: "On the way",
  DELIVERED: "Delivered",
  FAILED: "Drop failed",
  CANCELLED: "Drop cancelled",
};

/**
 * The factory's paid orders (product owner, 2026-11-03): counts per stage, then each order with
 * its items, delivery city, paid date and PickMe status. "Mark packed" is the only action. Never
 * buyer names or phones.
 */
export default async function FactoryOrdersPage() {
  const seller = await requireSeller();
  const { counts, orders } = await factoryOrderBoard(seller.id);
  const label = Object.fromEntries(STAGES) as Record<FactoryStage, string>;
  return (
    <>
      <PageHeader title="Orders" />
      <FactoryNav active="orders" />
      <ol
        aria-label="Orders by stage"
        className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 text-sm [scrollbar-width:none]"
      >
        {STAGES.map(([s, name], i) => (
          <li key={s} className="flex shrink-0 items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden className="text-subtle">
                →
              </span>
            )}
            <span className="whitespace-nowrap">{name}</span>
            <Badge tone={counts[s] ? TONE[s] : "neutral"}>{counts[s]}</Badge>
          </li>
        ))}
      </ol>
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id} className="rounded-xl border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">
                  {o.code}
                  <span className="block text-sm font-normal text-subtle">
                    {[o.deliveryCity, o.confirmedAt && `Paid ${formatDate(o.confirmedAt)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </p>
                <Badge tone={TONE[o.stage]}>{label[o.stage]}</Badge>
              </div>
              <ul className="mt-2 text-sm">
                {o.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2 border-t border-line py-1">
                    <span>
                      {l.variant.product.title} · {l.variant.size}
                      {l.variant.colour && ` · ${l.variant.colour}`}
                    </span>
                    <span className="font-medium tabular-nums">× {l.qty}</span>
                  </li>
                ))}
              </ul>
              {o.delivery && (
                <p className="mt-2 text-sm">
                  {DELIVERY[o.delivery.status] ?? o.delivery.status}
                  {o.delivery.driverName && ` · ${o.delivery.driverName}`}
                  {o.delivery.trackingUrl && (
                    <a
                      href={o.delivery.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-accent underline"
                    >
                      Track
                    </a>
                  )}
                </p>
              )}
              {o.stage === "toPack" && o.status === "CONFIRMED" && <MarkPacked cartId={o.id} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
