import Link from "next/link";
import { ProductImage } from "@/components/cart-bits";
import { CopyLinkButton } from "@/components/client";
import { Badge } from "@/components/ui";
import { D } from "@/lib/decimal";
import { formatLKR } from "@/lib/format";
import { appUrl } from "@/server/notify";
import type { buyerHome } from "@/server/orders/buyer";
import { orderTotal } from "@/server/orders/buyer";

type Home = Awaited<ReturnType<typeof buyerHome>>;
type Order = Home["orders"][number];

/** 0 Paid, 1 Filling, 2 On the way, 3 Ready / Delivered; null while unpaid. */
function stepOf(o: Order): number | null {
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

const done = (o: Order) =>
  (o.status === "RECEIVED" && o.lines.every((l) => l.collectedAt || l.status !== "ACTIVE")) ||
  o.basket?.status === "DELIVERED";

/**
 * The buyer home's orders (owner, 2026-11-21): the ones that need the buyer first (unpaid, ready,
 * still filling), collected or delivered ones dropped, three at most.
 */
export function homeOrders(orders: Order[]) {
  const rank = (o: Order) => {
    const s = stepOf(o);
    return s === null ? 0 : s === 3 ? 1 : s === 1 ? 2 : 3;
  };
  return orders
    .filter((o) => !done(o))
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.o);
}

export function HomeOrderCard({
  order: o,
  own,
  ownMinItems,
  lockAt,
}: {
  order: Order;
  own: Home["own"];
  ownMinItems: number;
  lockAt: D;
}) {
  const first = o.lines[0];
  const more = o.lines.length - 1;
  const step = stepOf(o);
  const isOwn = o.basket?.kind === "OWN";
  const steps = ["Paid", "Filling", "On the way", isOwn ? "Delivered" : "Ready"];
  const ownInfo = o.basket ? own.get(o.basket.id) : undefined;
  const productId = first?.variant.product.id;

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
              <span className="line-clamp-1">
                {first?.variant.product.title ?? "Order"}
                {first && first.qty > 1 && ` × ${first.qty}`}
              </span>
            </Link>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {formatLKR(orderTotal(o))}
            </span>
          </div>
          {more > 0 && (
            <p className="text-sm text-subtle">
              +{more} more item{more === 1 ? "" : "s"}
            </p>
          )}
          {step === null && (
            <span className="self-start">
              <Badge tone="bad">Unpaid</Badge>
            </span>
          )}
        </div>
      </div>

      {step !== null && (
        <ol className="grid grid-cols-4 gap-1" aria-label="Order progress">
          {steps.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className="flex flex-col gap-1.5"
            >
              <span
                className={`h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-muted"}`}
                aria-hidden
              />
              <span className={`text-xs ${i === step ? "font-semibold text-ink" : "text-subtle"}`}>
                {label}
                <span className="sr-only">{i < step ? " (done)" : i === step ? " (now)" : ""}</span>
              </span>
            </li>
          ))}
        </ol>
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
