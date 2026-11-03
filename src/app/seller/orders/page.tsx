import type { Metadata } from "next";
import { Badge, EmptyState, cx } from "@/components/ui";
import { sizeGrid } from "@/lib/factory-insights";
import { formatDate } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { type FactoryStage, STAGES, factoryOrderBoard } from "@/server/factory-dashboard";
import { FactoryShell, SizeGrid, Ticket } from "../factory-bits";
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
 * The factory's paid orders (product owner, 2026-11-03): the five stages in order with their
 * counts, then each order as a cutting ticket (sizes across, pieces in each cell) with its city,
 * paid date and PickMe status. "Mark packed" is the only action. Never buyer names or phones.
 */
export default async function FactoryOrdersPage() {
  const seller = await requireSeller();
  const { counts, orders } = await factoryOrderBoard(seller.id);
  const label = Object.fromEntries(STAGES) as Record<FactoryStage, string>;
  return (
    <FactoryShell active="orders" title="Orders">
      <ol aria-label="Orders by stage" className="mb-5 grid grid-cols-5 text-center text-xs">
        {STAGES.map(([s, name], i) => (
          <li key={s} className="relative flex flex-col items-center gap-1">
            {/* The line joins the stages: an order moves left to right. */}
            {i > 0 && (
              <span aria-hidden className="absolute top-4 right-1/2 h-0.5 w-full bg-line" />
            )}
            <span
              className={cx(
                "relative grid size-8 place-items-center rounded-full border-2 bg-paper text-sm font-bold tabular-nums",
                counts[s] === 0 && "border-line text-subtle",
                counts[s] > 0 && s === "failed" && "border-danger bg-danger text-paper",
                counts[s] > 0 && s === "toPack" && "border-accent bg-accent text-on-accent",
                counts[s] > 0 && s !== "failed" && s !== "toPack" && "border-ink",
              )}
            >
              {counts[s]}
            </span>
            <span className="leading-tight">{name}</span>
          </li>
        ))}
      </ol>
      {orders.length === 0 ? (
        <EmptyState title="No paid orders yet" />
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((o) => (
            <li key={o.id}>
              <Ticket
                tone={o.stage === "toPack" ? "accent" : o.stage === "failed" ? "danger" : "ink"}
                head={
                  <>
                    <span className="text-xl font-bold tracking-wide">{o.code}</span>
                    {o.stage === "toPack" ? (
                      <span className="font-bold">To pack</span>
                    ) : (
                      <Badge tone={TONE[o.stage]}>{label[o.stage]}</Badge>
                    )}
                  </>
                }
                foot={
                  <>
                    <dl className="grid grid-cols-2 gap-x-3 text-sm">
                      <dt className="text-subtle">To</dt>
                      <dd>{o.deliveryCity ?? "Not given"}</dd>
                      <dt className="text-subtle">Paid</dt>
                      <dd>{o.confirmedAt ? formatDate(o.confirmedAt) : "Not yet"}</dd>
                      {o.delivery && (
                        <>
                          <dt className="text-subtle">PickMe</dt>
                          <dd>{DELIVERY[o.delivery.status] ?? o.delivery.status}</dd>
                        </>
                      )}
                      {o.delivery?.driverName && (
                        <>
                          <dt className="text-subtle">Driver</dt>
                          <dd>{o.delivery.driverName}</dd>
                        </>
                      )}
                    </dl>
                    {o.delivery?.trackingUrl && (
                      <a
                        href={o.delivery.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex min-h-11 items-center font-bold text-accent underline"
                      >
                        Track the parcel
                      </a>
                    )}
                    {o.stage === "toPack" && o.status === "CONFIRMED" && (
                      <MarkPacked cartId={o.id} />
                    )}
                  </>
                }
              >
                <SizeGrid
                  grid={sizeGrid(
                    o.lines.map((l) => ({
                      qty: l.qty,
                      size: l.variant.size,
                      colour: l.variant.colour,
                      product: l.variant.product.title,
                    })),
                  )}
                />
              </Ticket>
            </li>
          ))}
        </ul>
      )}
    </FactoryShell>
  );
}
