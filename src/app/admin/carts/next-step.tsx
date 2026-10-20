import { type CartStatus, progress } from "@/lib/cart-rules";
import { formatDate, formatLKR, timeLeft } from "@/lib/format";
import { cx } from "@/components/ui";

type Money = { toString(): string };

export type StepCart = {
  status: CartStatus;
  code: string;
  expiresAt: Date;
  slipDueAt: Date | null;
  updatedAt: Date;
  closedReason: string | null;
  delivery: { status: string } | null;
};

type Step = { text: string; tone?: "warn" | "bad" };

/**
 * What happens next with a cart, as one line of text: who is waited on and the deadline. No
 * buttons: slips are reviewed in Slips, PickMe is handled in Orders (product owner, 2026-10-21).
 */
export function adminNextStep(c: StepCart, now: Date): Step | null {
  switch (c.status) {
    case "OPEN":
      return { text: `Filling · ${timeLeft(c.expiresAt, now)}` };
    case "READY":
      return { text: `Owner to accept · ${timeLeft(c.expiresAt, now)}`, tone: "warn" };
    case "AWAITING_SLIP":
      return {
        text: `Owner to pay · ${c.slipDueAt ? timeLeft(c.slipDueAt, now) : "no deadline"}`,
        tone: "warn",
      };
    case "SLIP_REVIEW":
      return { text: "Slip waiting for review", tone: "warn" };
    case "CONFIRMED":
      return { text: "PickMe to book", tone: "warn" };
    case "DISPATCHED":
      return c.delivery?.status === "FAILED" || c.delivery?.status === "CANCELLED"
        ? { text: "Delivery failed", tone: "bad" }
        : { text: c.delivery?.status === "PICKED_UP" ? "On the way" : "In store" };
    case "DELIVERED":
      return { text: `Delivered ${formatDate(c.updatedAt)}` };
    case "EXPIRED":
      return { text: c.closedReason ?? "Expired", tone: "bad" };
    case "CANCELLED":
      return { text: c.closedReason ?? "Cancelled", tone: "bad" };
  }
}

/** The step as a line of text, plus a button when it's the admin's move. */
export function NextStep({
  cart,
  now,
  className,
}: {
  cart: StepCart;
  now: Date;
  className?: string;
}) {
  const step = adminNextStep(cart, now);
  if (!step) return null;
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      <span
        className={cx(
          "text-sm",
          step.tone === "warn" && "text-warn",
          step.tone === "bad" && "text-danger",
          !step.tone && "text-subtle",
        )}
      >
        {step.text}
      </span>
    </div>
  );
}

/** A thin bar toward the cart's minimum, with "76% of LKR 50,000". */
export function MiniProgress({ total, min }: { total: Money; min: Money }) {
  const p = progress(total.toString(), min.toString());
  return (
    <div className="mt-1 w-full max-w-48">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Toward the minimum"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(2, p * 100)}%` }}
        />
      </div>
      <p className="mt-0.5 text-[11px] text-subtle">
        {Math.floor(p * 100)}% of {formatLKR(min)}
      </p>
    </div>
  );
}
