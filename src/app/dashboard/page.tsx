import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProgressBar, StatusBadge } from "@/components/cart-bits";
import { CopyLinkButton, Countdown } from "@/components/client";
import { Toast } from "@/components/toast";
import { Alert, Button, Card, LinkButton } from "@/components/ui";
import {
  HOLDS_STOCK,
  JOURNEY,
  amountDue,
  cartTotal,
  journeyStep,
  nextStep,
} from "@/lib/cart-rules";
import { formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { markReceivedAction } from "@/server/carts/actions";
import { buyerDashboard } from "@/server/carts/queries";
import { sweep } from "@/server/carts/service";
import { appUrl } from "@/server/notify";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Dashboard" };

const IN_FLIGHT = ["CONFIRMED", "DISPATCHED"] as const;
const PAID = ["CONFIRMED", "DISPATCHED", "DELIVERED"] as const;

/**
 * One card for the buyer's one cart (rule 12) with one sentence and one button, then a short list
 * of past orders. Nothing else: notices live behind the bell.
 */
export default async function BuyerDashboard({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser([], "/dashboard");
  if (user.role === "SELLER") redirect("/seller");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  await sweep();
  const now = new Date();
  const [{ carts, invites }, settings] = await Promise.all([
    buyerDashboard(user.id, now),
    getSettings(),
  ]);

  const rows = carts.map((c) => ({
    ...c,
    mine: c.ownerId === user.id,
    share: amountDue(
      cartTotal(c.lines),
      c.lines.map((l) => l.tokensApplied.toString()),
    ),
    label: c.name || `${c.owner.name}'s cart`,
  }));
  // The cart that needs attention: the active one, else an order still on its way.
  const current =
    rows.find((c) => HOLDS_STOCK.includes(c.status)) ??
    rows.find((c) => (IN_FLIGHT as readonly string[]).includes(c.status));
  const past = rows.filter((c) => c !== current && (PAID as readonly string[]).includes(c.status));
  const orders = past.slice(0, 3);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Hi, {user.name.split(" ")[0]}</h1>
      <Link href="/samples" className="text-sm text-accent underline">
        Request or track group design samples
      </Link>
      {error && <Alert>{error}</Alert>}
      {sp.received && <Toast>Marked as delivered. Enjoy your order!</Toast>}

      {current ? (
        <CurrentCart cart={current} />
      ) : (
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">You&apos;re not in a cart yet</h2>
            <p className="mt-1 text-sm text-subtle">
              Team up to reach {formatLKR(settings.minOrderValue)} and buy at factory prices.
            </p>
          </div>
          {invites.length > 0 && (
            <ul className="flex flex-col gap-2 text-sm">
              {invites.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/c/${i.cart.code}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line p-3 hover:border-accent"
                  >
                    <span>
                      {i.invitedBy.name} invited you to <b>{i.cart.name || i.cart.code}</b>
                    </span>
                    <span className="shrink-0 text-accent">View →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/carts">Find an open cart</LinkButton>
            <LinkButton href="/carts/new" variant="secondary">
              Start my own cart
            </LinkButton>
          </div>
        </Card>
      )}

      {orders.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold">
              {current ? "Past orders" : "Your orders"} ({past.length})
            </h2>
            <Link href="/my-carts" className="text-sm text-accent">
              See all →
            </Link>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {orders.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/c/${c.code}`}
                  className="flex items-center justify-between gap-3 p-3 hover:bg-muted"
                >
                  <span className="min-w-0 truncate font-medium">{c.label}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-subtle">{formatLKR(c.share)}</span>
                    <StatusBadge status={c.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type DashCart = Awaited<ReturnType<typeof buyerDashboard>>["carts"][number] & {
  mine: boolean;
  share: ReturnType<typeof cartTotal>;
  label: string;
};

function CurrentCart({ cart: c }: { cart: DashCart }) {
  const step = nextStep({
    status: c.status,
    mine: c.mine,
    code: c.code,
    total: amountDue(c.total.toString(), [c.tokensApplied]),
    minOrderValue: c.minOrderValue.toString(),
    share: c.share,
    ownerName: c.owner.name + (c.owner.phone ? ` (${c.owner.phone})` : ""),
    rejectedNote: c.slips[0]?.status === "REJECTED" ? c.slips[0].reviewNote : null,
    trackingUrl: c.delivery?.trackingUrl,
  });
  const until =
    step.deadline === "slip" ? c.slipDueAt : step.deadline === "expires" ? c.expiresAt : null;
  const reached = journeyStep(c.status);

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      {/* The status pill drops under the name when both don't fit (small phones). */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_12rem]">
          <h2 className="text-lg leading-snug font-semibold break-words">{c.label}</h2>
          <p className="text-xs text-subtle">
            {c._count.members} {c._count.members === 1 ? "member" : "members"}
          </p>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <ol className="grid grid-cols-4 gap-1 text-[11px] sm:text-xs" aria-label="Progress">
        {JOURNEY.map((label, i) => (
          <li key={label} className="flex flex-col gap-1.5 text-center">
            <span className={`h-1.5 rounded-full ${i <= reached ? "bg-accent" : "bg-muted"}`} />
            <span
              className={i === reached ? "font-semibold" : i < reached ? "" : "text-subtle"}
              aria-current={i === reached ? "step" : undefined}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      {c.status === "OPEN" && <ProgressBar total={c.total} min={c.minOrderValue} />}

      <div className="flex flex-col gap-1">
        {step.text && <p className="text-base font-medium">{step.text}</p>}
        {step.note && <p className="text-sm text-subtle">{step.note}</p>}
        {until && (
          <p className="text-sm font-medium text-warn">
            <Countdown until={until.toISOString()} prefix="⏱ " />
          </p>
        )}
      </div>

      {/* Phones: full-width buttons stacked for the thumb. From sm: one row. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        {step.action &&
          (step.action.external ? (
            <LinkButton
              href={step.action.href}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto"
            >
              {step.action.label}
            </LinkButton>
          ) : (
            <LinkButton href={step.action.href} className="w-full sm:w-auto">
              {step.action.label}
            </LinkButton>
          ))}
        {step.received && (
          // Can't be undone, so it asks once more (no JavaScript needed).
          <details className="group w-full sm:w-auto">
            <summary className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted sm:min-h-10 sm:w-auto group-open:hidden">
              Mark as delivered
            </summary>
            <form
              action={markReceivedAction}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <input type="hidden" name="cartId" value={c.id} />
              <span className="text-sm">Got everything from the driver?</span>
              <Button className="w-full sm:w-auto">Yes, I&apos;ve received it</Button>
            </form>
          </details>
        )}
        {step.share && <CopyLinkButton url={appUrl(`/c/${c.code}`)} className="w-full sm:w-auto" />}
        {step.action?.href !== `/c/${c.code}` && (
          <Link
            href={`/c/${c.code}`}
            className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-accent sm:min-h-0"
          >
            View cart →
          </Link>
        )}
      </div>
    </Card>
  );
}
