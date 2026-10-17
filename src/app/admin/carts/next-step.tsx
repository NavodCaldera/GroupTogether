import Link from "next/link";
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
  /** The slip waiting for review, if any */
  pendingSlipId?: string | null;
};

type Step = { text: string; action?: { label: string; href: string }; tone?: "warn" | "bad" };

/**
 * What happens next with a cart, from the admin's side. When it's the admin's move there is an
 * action; otherwise a line saying who is waited on and the deadline.
 */
export function adminNextStep(c: StepCart, now: Date): Step {
  const page = `/admin/carts/${c.code}`;
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
      return {
        text: "Slip waiting for review",
        action: {
          label: "Review slip",
          href: c.pendingSlipId ? `/admin/slips?slip=${c.pendingSlipId}` : "/admin/slips",
        },
      };
    case "CONFIRMED":
      return {
        text: "Paid, not booked yet",
        action: { label: "Book delivery", href: `${page}#book` },
      };
    case "DISPATCHED":
      return c.delivery?.status === "FAILED"
        ? {
            text: "Delivery failed",
            tone: "bad",
            action: { label: "Open", href: `${page}#delivery` },
          }
        : {
            text: c.delivery?.status === "PICKED_UP" ? "Picked up by PickMe" : "Booked with PickMe",
            action: { label: "Mark delivered", href: `${page}#delivery` },
          };
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
      {step.action && (
        <Link
          href={step.action.href}
          className="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-medium whitespace-nowrap text-on-accent hover:opacity-90 sm:min-h-8"
        >
          {step.action.label} →
        </Link>
      )}
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
