import Link from "next/link";
import { ProductImage } from "@/components/cart-bits";
import { CopyLinkButton } from "@/components/client";
import { StepTrack } from "@/components/step-track";
import { Badge } from "@/components/ui";
import { D, toD } from "@/lib/decimal";
import { formatDate, formatLKR } from "@/lib/format";
import { appUrl } from "@/server/notify";
import type { OwnProgress, buyerOrders } from "@/server/orders/buyer";
import { orderTotal } from "@/server/orders/buyer";

export type Order = Awaited<ReturnType<typeof buyerOrders>>["orders"][number];

/** 0 Paid, 1 Filling, 2 On the way, 3 Ready / Delivered; null while unpaid. */
export function stepOf(o: Order): number | null {
  if (o.status === "PENDING") return null;
  if (o.status === "RECEIVED") return 3;
  switch (o.basket?.status) {
    case "OPEN":
      return 1;
    case "AT_AGENT":
    case "DELIVERED":
      return 3;
    case undefined:
      return 0;
    default:
      return 2;
  }
}

/** Finished: collected, delivered or cancelled. */
export function endOf(o: Order): { label: string; tone: "good" | "bad" } | null {
  if (o.status === "CANCELLED" || o.basket?.status === "CANCELLED")
    return { label: "Cancelled", tone: "bad" };
  if (o.basket?.status === "DELIVERED") return { label: "Delivered", tone: "good" };
  if (o.status === "RECEIVED" && o.lines.every((l) => l.collectedAt || l.status !== "ACTIVE"))
    return { label: "Collected", tone: "good" };
  return null;
}

const done = (o: Order) => endOf(o) !== null;

export type OrderGroup = "pickup" | "mine" | "joined";

/** Pickup: through an agent. Mine: an own basket the buyer started. Joined: someone else's. */
export function groupOf(o: Order, viewerId: string): OrderGroup {
  if (o.agentId) return "pickup";
  return o.basket && o.basket.ownerId !== viewerId ? "joined" : "mine";
}

/** Orders page: what is still moving, then the finished ones (both newest first). */
export function splitOrders(orders: Order[]) {
  return { active: sortActive(orders.filter((o) => !done(o))), past: orders.filter(done) };
}

function sortActive(orders: Order[]) {
  const rank = (o: Order) => {
    const s = stepOf(o);
    return s === null ? 0 : s === 3 ? 1 : s === 1 ? 2 : 3;
  };
  return orders
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
    .map((x) => x.o);
}

/** One order, item first: photo, product × qty, total, where it goes, and its progress. */
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
  const first = o.lines[0];
  const more = o.lines.length - 1;
  const end = endOf(o);
  const step = end ? null : stepOf(o);
  const { next, share } = nextOf(o, step, own, ownMinItems, lockAt);

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
                {first && first.qty > 1 && ` × ${first.qty}`}
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
                (o.basket && o.basket.ownerId !== viewerId ? o.basket.owner?.name : null),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {(end || step === null) && (
            <span className="self-start">
              <Badge tone={end?.tone ?? "bad"}>{end?.label ?? "Unpaid"}</Badge>
            </span>
          )}
        </div>
      </div>

      {step !== null && (
        <OrderSteps order={o} step={step} fill={fillOf(o, step, own, ownMinItems, lockAt)} />
      )}

      {(next || share) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {next && <p className="text-sm text-subtle tabular-nums">{next}</p>}
          {share && <CopyLinkButton url={share} label="Share basket" className="relative z-10" />}
        </div>
      )}
    </div>
  );
}

/** What comes next for a filling or ready order, and the basket's share link. */
export function nextOf(
  o: Order,
  step: number | null,
  own: OwnProgress,
  ownMinItems: number,
  lockAt: D,
) {
  const isOwn = o.basket?.kind === "OWN";
  const ownInfo = o.basket ? own.get(o.basket.id) : undefined;
  const productId = o.lines[0]?.variant.product.id;
  let next: React.ReactNode = null;
  let share: string | null = null;
  if (step === 1 && o.basket) {
    if (isOwn && ownInfo) {
      const need = Math.max(ownMinItems - ownInfo.items, 0);
      next = (
        <>
          <strong className="text-ink">{ownInfo.items}</strong> of {ownMinItems} items
          {need > 0 && ` · needs ${need} more`}
        </>
      );
      if (ownInfo.shareCode)
        share = appUrl(`/own-baskets/${o.basket.id}?code=${ownInfo.shareCode}`);
    } else if (!isOwn) {
      next = (
        <>
          <strong className="text-ink">{formatLKR(o.basket.total)}</strong> of {formatLKR(lockAt)}
        </>
      );
      if (o.agentId && productId) share = appUrl(`/products/${productId}?agent=${o.agentId}`);
    }
  } else if (step === 3 && !isOwn) {
    next = <>Collect from {o.agent?.user.name}</>;
  }
  return { next, share };
}

/** How full a filling basket is (0 to 1): items against the minimum, or value against the lock
 * amount. Null when the order is not at the Filling step. */
export function fillOf(
  o: Order,
  step: number | null,
  own: OwnProgress,
  ownMinItems: number,
  lockAt: D,
): number | null {
  if (step !== 1 || !o.basket) return null;
  if (o.basket.kind === "OWN") {
    const items = own.get(o.basket.id)?.items;
    return items === undefined ? null : items / Math.max(ownMinItems, 1);
  }
  return lockAt.lte(0) ? 1 : toD(o.basket.total).div(lockAt).toNumber();
}

/** Paid → Filling → On the way → Ready (Delivered for own baskets). */
export function OrderSteps({
  order,
  step,
  fill,
  dates,
}: {
  order: Order;
  step: number;
  fill?: number | null;
  dates?: (string | null | undefined)[];
}) {
  const steps = [
    "Paid",
    "Filling",
    "On the way",
    order.basket?.kind === "OWN" ? "Delivered" : "Ready",
  ];
  return <StepTrack steps={steps} step={step} label="Order progress" fill={fill} dates={dates} />;
}
