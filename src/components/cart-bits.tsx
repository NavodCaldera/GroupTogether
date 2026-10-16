import Link from "next/link";
import { type CartStatus, STATUS_LABEL, progress, remaining } from "@/lib/cart-rules";
import { formatLKR, timeLeft } from "@/lib/format";
import { Badge } from "./ui";

type Money = { toString(): string };

export function ProgressBar({ total, min }: { total: Money; min: Money }) {
  const p = progress(total.toString(), min.toString());
  const left = remaining(total.toString(), min.toString());
  return (
    <div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(2, p * 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between gap-2 text-xs text-subtle">
        <span>
          <strong className="text-ink">{formatLKR(total)}</strong> of {formatLKR(min)}
        </span>
        <span>{left.gt(0) ? `${formatLKR(left)} to go` : "Minimum reached"}</span>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: CartStatus }) {
  const tone =
    status === "READY" || status === "CONFIRMED" || status === "DELIVERED"
      ? "good"
      : status === "AWAITING_SLIP" || status === "SLIP_REVIEW"
        ? "warn"
        : status === "EXPIRED" || status === "CANCELLED"
          ? "bad"
          : status === "DISPATCHED"
            ? "info"
            : "neutral";
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

export type PanelCartView = {
  code: string;
  name: string;
  status: CartStatus;
  total: Money;
  minOrderValue: Money;
  expiresAt: Date;
  owner: { name: string; city: string | null };
  _count: { members: number };
};

/** One card on the "recent carts" panel. */
export function CartCard({ cart }: { cart: PanelCartView }) {
  return (
    <Link
      href={`/c/${cart.code}`}
      className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4 transition hover:border-accent"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{cart.name || `${cart.owner.name}'s cart`}</p>
          <p className="text-xs text-subtle">
            {cart.owner.name.split(" ")[0]}
            {cart.owner.city ? ` · ${cart.owner.city}` : ""} · {cart._count.members}{" "}
            {cart._count.members === 1 ? "member" : "members"}
          </p>
        </div>
        <StatusBadge status={cart.status} />
      </div>
      <ProgressBar total={cart.total} min={cart.minOrderValue} />
      <div className="flex items-center justify-between text-xs">
        <span className="text-warn">{timeLeft(cart.expiresAt)}</span>
        <span className="font-semibold text-accent">Join →</span>
      </div>
    </Link>
  );
}

export function StockTypeBadge({ stockType }: { stockType: "FACTORY_SURPLUS" | "B_GRADE" }) {
  return stockType === "B_GRADE" ? (
    <Badge tone="warn">B-grade</Badge>
  ) : (
    <Badge tone="info">Factory surplus</Badge>
  );
}

export function ProductImage({
  photoKey,
  id,
  title,
  category,
  className = "",
}: {
  photoKey: string | null;
  id: string;
  title: string;
  category: "SHOES" | "APPAREL";
  className?: string;
}) {
  if (photoKey)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/photos/${id}`}
        alt={title}
        loading="lazy"
        decoding="async"
        className={`aspect-square w-full rounded-lg bg-muted object-cover ${className}`}
      />
    );
  return (
    <div
      className={`flex aspect-square w-full items-center justify-center rounded-lg bg-muted text-4xl ${className}`}
      aria-hidden="true"
    >
      {category === "SHOES" ? "👟" : "👕"}
    </div>
  );
}
