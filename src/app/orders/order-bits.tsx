import { Badge } from "@/components/ui";
import { D } from "@/lib/decimal";
import { formatLKR } from "@/lib/format";
import type { LineState } from "@/server/orders/buyer";

type Money = { toString(): string };

const ORDER_LABEL = {
  PENDING: "Unpaid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  RECEIVED: "Received",
} as const;

const BASKET_LABEL = {
  OPEN: "Filling",
  LOCKED: "Packing",
  PACKED: "Packed",
  WITH_COURIER: "On the way",
  AT_AGENT: "At agent",
} as const;

export function OrderBadge({
  status,
  collected = false,
}: {
  status: keyof typeof ORDER_LABEL;
  collected?: boolean;
}) {
  if (status === "RECEIVED" && collected) return <Badge tone="good">Collected</Badge>;
  return (
    <Badge
      tone={
        status === "CANCELLED"
          ? "bad"
          : status === "RECEIVED"
            ? "good"
            : status === "PAID"
              ? "info"
              : "neutral"
      }
    >
      {ORDER_LABEL[status]}
    </Badge>
  );
}

export function LineBadge({ state }: { state: LineState }) {
  return (
    <Badge
      tone={
        state === "Cancelled"
          ? "bad"
          : state === "Collected" || state === "Received"
            ? "good"
            : state === "Paid"
              ? "info"
              : "neutral"
      }
    >
      {state}
    </Badge>
  );
}

/** total / lock amount for an OPEN basket; the basket's stage once it has locked. */
export function BasketProgress({
  basket,
  lockAt,
}: {
  basket: { status: keyof typeof BASKET_LABEL; total: Money };
  lockAt: Money;
}) {
  if (basket.status !== "OPEN")
    return (
      <p className="text-sm">
        Basket <strong>{BASKET_LABEL[basket.status]}</strong>
      </p>
    );
  const min = new D(lockAt.toString());
  const pct = min.lte(0)
    ? 100
    : Math.min(100, Math.round(new D(basket.total.toString()).div(min).times(100).toNumber()));
  return (
    <div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Basket progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-subtle tabular-nums">
        <strong className="text-ink">{formatLKR(basket.total)}</strong> / {formatLKR(lockAt)}
      </p>
    </div>
  );
}

export const factoryName = (f: { name: string; company: string | null }) => f.company || f.name;
