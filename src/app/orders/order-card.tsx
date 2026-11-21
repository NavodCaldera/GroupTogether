import Link from "next/link";
import { ProductImage } from "@/components/cart-bits";
import { StepTrack } from "@/components/step-track";
import { D, toD } from "@/lib/decimal";
import { formatDate, formatLKR } from "@/lib/format";
import { STAGE_LABEL, STAGES, TRACK, orderStage, type Stage } from "@/lib/order-stage";
import type { OwnProgress, buyerOrders } from "@/server/orders/buyer";
import { orderTotal } from "@/server/orders/buyer";

export type Order = Awaited<ReturnType<typeof buyerOrders>>["orders"][number];

export type OrderGroup = "pickup" | "mine" | "joined";

/** Pickup: through an agent. Mine: an own basket the buyer started. Joined: someone else's. */
export function groupOf(o: Order, viewerId: string): OrderGroup {
  if (o.agentId) return "pickup";
  return o.basket && o.basket.ownerId !== viewerId ? "joined" : "mine";
}

/** The Orders page's groups, in stage order, empty ones left out (DEC-026). */
export function groupByStage(orders: Order[]) {
  return STAGES.map((stage) => ({
    stage,
    orders: orders.filter((o) => orderStage(o) === stage),
  })).filter((g) => g.orders.length > 0);
}

/** The order's products, sizes of one product counted together: the first, its pieces, and how
 * many other products there are ("+N more"). */
export function productsOf(o: Pick<Order, "lines">) {
  const first = o.lines[0];
  const ids = new Set(o.lines.map((l) => l.variant.product.id));
  const qty = first
    ? o.lines
        .filter((l) => l.variant.product.id === first.variant.product.id)
        .reduce((n, l) => n + l.qty, 0)
    : 0;
  return { first, qty, more: Math.max(ids.size - 1, 0) };
}

/** One order, item first: photo, product × qty, total, where it goes, and its stage. */
export function OrderCard({
  order: o,
  own,
  ownMinItems,
  lockAt,
  viewerId,
}: {
  order: Order;
  own: OwnProgress;
  ownMinItems: number;
  lockAt: D;
  viewerId: string;
}) {
  const { first, qty, more } = productsOf(o);
  const stage = orderStage(o);
  const next = nextOf(o, stage, own, ownMinItems, lockAt);

  return (
    <div className="relative flex flex-col gap-3 rounded-xl border border-line bg-paper p-4 hover:border-subtle">
      <div className="flex gap-3">
        {first && (
          <div className="w-16 shrink-0">
            <ProductImage {...first.variant.product} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/orders/${o.id}`}
              className="min-w-0 font-semibold underline-offset-2 after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:underline"
            >
              <span className="line-clamp-2">
                {first?.variant.product.title ?? "Order"}
                {qty > 1 && ` × ${qty}`}
              </span>
            </Link>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {formatLKR(orderTotal(o))}
            </span>
          </div>
          <p className="text-sm text-subtle">
            {more > 0 && `+${more} more item${more === 1 ? "" : "s"} · `}
            {[
              formatDate(o.createdAt),
              o.agent?.user.name ??
                (o.basket && o.basket.ownerId !== viewerId
                  ? o.basket.owner?.name.split(" ")[0]
                  : null),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {stage && stage !== "refunded" && (
        <OrderSteps stage={stage} fill={fillOf(o, stage, own, ownMinItems, lockAt)} />
      )}

      {next && <p className="text-sm text-subtle tabular-nums">{next}</p>}
    </div>
  );
}

/** While filling: how far the basket has got. */
export function nextOf(
  o: Order,
  stage: Stage | null,
  own: OwnProgress,
  ownMinItems: number,
  lockAt: D,
) {
  let next: React.ReactNode = null;
  if (stage !== "filling" || !o.basket) return next;
  if (o.basket.kind === "OWN") {
    const ownInfo = own.get(o.basket.id);
    if (ownInfo) {
      const need = Math.max(ownMinItems - ownInfo.items, 0);
      next = (
        <>
          <strong className="text-ink">{ownInfo.items}</strong> of {ownMinItems} items
          {need > 0 && ` · needs ${need} more`}
        </>
      );
    }
  } else {
    next = (
      <>
        <strong className="text-ink">{formatLKR(o.basket.total)}</strong> of {formatLKR(lockAt)}
      </>
    );
  }
  return next;
}

/** How full a filling basket is (0 to 1): items against the minimum, or value against the lock
 * amount. Null unless the order is filling. */
export function fillOf(
  o: Order,
  stage: Stage | null,
  own: OwnProgress,
  ownMinItems: number,
  lockAt: D,
): number | null {
  if (stage !== "filling" || !o.basket) return null;
  if (o.basket.kind === "OWN") {
    const items = own.get(o.basket.id)?.items;
    return items === undefined ? null : items / Math.max(ownMinItems, 1);
  }
  return lockAt.lte(0) ? 1 : toD(o.basket.total).div(lockAt).toNumber();
}

/** Filling → Packing → On the way → Delivered (DEC-026). */
export function OrderSteps({
  stage,
  fill,
  dates,
}: {
  stage: Exclude<Stage, "refunded">;
  fill?: number | null;
  dates?: (string | null | undefined)[];
}) {
  return (
    <StepTrack
      steps={TRACK.map((s) => STAGE_LABEL[s])}
      step={TRACK.indexOf(stage)}
      label="Order progress"
      fill={fill}
      dates={dates}
    />
  );
}
