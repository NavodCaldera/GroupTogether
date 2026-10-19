import Link from "next/link";
import { formatDistance } from "@/lib/distance";
import { type CartStatus, STATUS_LABEL, progress, remaining } from "@/lib/cart-rules";
import { endsWithin, formatLKR, timeLeft } from "@/lib/format";
import { Badge } from "./ui";

type Money = { toString(): string };

export function ProgressBar({ total, min }: { total: Money; min: Money }) {
  const p = progress(total.toString(), min.toString());
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
      <p className="mt-1.5 text-xs text-subtle">
        <strong className="text-ink">{formatLKR(total)}</strong> of {formatLKR(min)}
      </p>
    </div>
  );
}

export function StatusBadge({ status }: { status: CartStatus }) {
  const tone =
    status === "READY" || status === "CONFIRMED" || status === "DELIVERED"
      ? "good"
      : status === "AWAITING_SLIP" || status === "SLIP_REVIEW"
        ? "info"
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
  /** Km from the signed-in buyer's pin to the delivery point, when both are known */
  distanceKm?: number | null;
};

/** One card on the open carts panel: name, progress, what is left, and distance and time. */
export function CartCard({ cart }: { cart: PanelCartView }) {
  const p = progress(cart.total.toString(), cart.minOrderValue.toString());
  const left = remaining(cart.total.toString(), cart.minOrderValue.toString());
  const details = [
    cart.distanceKm != null ? formatDistance(cart.distanceKm).replace(" away", "") : null,
    timeLeft(cart.expiresAt),
  ].filter(Boolean);
  return (
    <Link
      href={`/c/${cart.code}`}
      className="flex flex-col gap-2.5 rounded-xl border border-line bg-paper p-4 transition hover:border-accent"
    >
      <p className="truncate font-semibold">{cart.name || `${cart.owner.name}'s cart`}</p>
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
      <p className={`text-sm font-medium ${left.gt(0) ? "" : "text-accent"}`}>
        {left.gt(0) ? `${formatLKR(left)} to go` : "Minimum reached"}
      </p>
      {/* Grey, turning amber only in the last 2 hours. */}
      <p className={`text-xs ${endsWithin(cart.expiresAt, 2) ? "text-warn" : "text-subtle"}`}>
        {details.join(" · ")}
      </p>
    </Link>
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
