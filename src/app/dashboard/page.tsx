import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProgressBar, StatusBadge } from "@/components/cart-bits";
import { Countdown } from "@/components/client";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { HOLDS_STOCK, addHours, cartTotal, remaining } from "@/lib/cart-rules";
import { D } from "@/lib/decimal";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { buyerDashboard } from "@/server/carts/queries";
import { sweep } from "@/server/carts/service";

export const metadata: Metadata = { title: "Dashboard" };

const PAID = ["CONFIRMED", "DISPATCHED", "DELIVERED"] as const;

type Todo = { key: string; text: ReactNode; href: string; until?: Date | null; urgent?: boolean };

export default async function BuyerDashboard() {
  const user = await requireUser([], "/dashboard");
  await sweep();
  const now = new Date();
  const { carts, invites, notices } = await buyerDashboard(user.id, now);

  const rows = carts.map((c) => ({
    ...c,
    mine: c.ownerId === user.id,
    share: cartTotal(c.lines),
    items: c.lines.reduce((n, l) => n + l.qty, 0),
    label: c.name || c.code,
  }));
  const active = rows.filter((c) => HOLDS_STOCK.includes(c.status));
  const orders = rows.filter((c) => (PAID as readonly string[]).includes(c.status));
  const closed = rows.filter((c) => c.status === "EXPIRED" || c.status === "CANCELLED");
  const spent = orders.reduce((sum, c) => sum.plus(c.share), new D(0));

  // What needs this buyer now, most pressing first.
  const todos: Todo[] = [];
  for (const c of rows) {
    if (c.mine && c.status === "AWAITING_SLIP") {
      const rejected = c.slips[0]?.status === "REJECTED" ? c.slips[0].reviewNote : null;
      todos.push({
        key: `${c.code}-slip`,
        href: `/c/${c.code}/pay`,
        until: c.slipDueAt,
        urgent: true,
        text: (
          <>
            Pay {formatLKR(c.total)} for <b>{c.label}</b> and upload the bank slip
            {rejected && <span className="text-danger"> (last slip not accepted: {rejected})</span>}
          </>
        ),
      });
    } else if (c.mine && c.status === "READY") {
      todos.push({
        key: `${c.code}-accept`,
        href: `/c/${c.code}`,
        until: c.expiresAt,
        urgent: true,
        text: (
          <>
            <b>{c.label}</b> reached the minimum. Accept the order and pay for the whole cart.
          </>
        ),
      });
    } else if (c.mine && c.status === "DISPATCHED") {
      todos.push({
        key: `${c.code}-driver`,
        href: `/c/${c.code}`,
        text: (
          <>
            A PickMe driver is bringing <b>{c.label}</b>. Pay the driver the delivery fee
            {c.delivery?.quotedFee ? ` (about ${formatLKR(c.delivery.quotedFee)})` : ""}.
          </>
        ),
      });
    } else if (c.status === "OPEN" && c.expiresAt <= addHours(now, 6)) {
      todos.push({
        key: `${c.code}-fill`,
        href: `/c/${c.code}`,
        until: c.expiresAt,
        text: (
          <>
            <b>{c.label}</b> needs{" "}
            {formatLKR(remaining(c.total.toString(), c.minOrderValue.toString()))} more. Share it
            before it expires.
          </>
        ),
      });
    }
  }
  for (const i of invites) {
    todos.push({
      key: i.id,
      href: `/c/${i.cart.code}`,
      text: (
        <>
          {i.invitedBy.name} invited you to <b>{i.cart.name || i.cart.code}</b>
        </>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Hi, ${user.name.split(" ")[0]}`}
        description="Your group carts and orders at a glance."
        actions={
          <>
            <LinkButton href="/carts/new">Start a cart</LinkButton>
            <LinkButton href="/carts" variant="secondary">
              Join a cart
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label="Active carts" value={String(active.length)} />
        <Stat label="Orders" value={String(orders.length)} />
        <Stat label="Your items in orders" value={formatLKR(spent)} />
      </div>

      <Section title="To do">
        {todos.length === 0 ? (
          <p className="text-sm text-subtle">Nothing needs you right now.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todos.map((t) => (
              <li key={t.key}>
                <Link
                  href={t.href}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-paper p-3 text-sm hover:border-accent sm:p-4 ${t.urgent ? "border-warn" : "border-line"}`}
                >
                  <span className="min-w-0">{t.text}</span>
                  {t.until && (
                    <span className="shrink-0 text-xs font-medium text-warn">
                      <Countdown until={t.until.toISOString()} />
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Active carts">
        {active.length === 0 ? (
          <EmptyState title="You're not in any open carts">
            <Link href="/carts" className="font-medium text-accent underline">
              Join an open cart
            </Link>{" "}
            or{" "}
            <Link href="/carts/new" className="font-medium text-accent underline">
              start one
            </Link>
            .
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {active.map((c) => (
              <Link
                key={c.id}
                href={`/c/${c.code}`}
                className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4 hover:border-accent"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.label}</p>
                    <p className="text-xs text-subtle">
                      {c.mine ? "You own this cart" : `Owner: ${c.owner.name}`} · {c._count.members}{" "}
                      {c._count.members === 1 ? "member" : "members"}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <ProgressBar total={c.total} min={c.minOrderValue} />
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  <span>
                    Your items: <b>{formatLKR(c.share)}</b> ({c.items})
                  </span>
                  <span className="text-warn">
                    {c.status === "AWAITING_SLIP" && c.slipDueAt ? (
                      <Countdown until={c.slipDueAt.toISOString()} prefix="Slip: " />
                    ) : c.status === "SLIP_REVIEW" ? (
                      "Payment being checked"
                    ) : (
                      <Countdown until={c.expiresAt.toISOString()} />
                    )}
                  </span>
                </div>
                {!c.mine && (c.status === "AWAITING_SLIP" || c.status === "SLIP_REVIEW") && (
                  <p className="text-xs text-subtle">
                    The owner is paying for the whole cart. Settle your {formatLKR(c.share)} with{" "}
                    {c.owner.name}
                    {c.owner.phone ? ` (${c.owner.phone})` : ""}.
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Orders">
        {orders.length === 0 ? (
          <p className="text-sm text-subtle">
            No orders yet. A cart becomes an order once its owner&apos;s payment is confirmed.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-paper text-sm">
            {orders.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <Link href={`/c/${c.code}`} className="font-medium hover:underline">
                    {c.label}
                  </Link>
                  <p className="text-xs text-subtle">
                    Confirmed {formatDateTime(c.confirmedAt)} · your items {formatLKR(c.share)}
                    {c.mine ? " · delivered to you" : ` · delivered to ${c.owner.name}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {c.mine && c.delivery?.trackingUrl && c.status === "DISPATCHED" && (
                    <a
                      href={c.delivery.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent underline"
                    >
                      Track
                    </a>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {closed.length > 0 && (
          <p className="mt-2 text-xs text-subtle">
            {closed.length} expired or cancelled {closed.length === 1 ? "cart" : "carts"} ·{" "}
            <Link href="/my-carts" className="underline">
              see all my carts
            </Link>
          </p>
        )}
      </Section>

      <Section title="Latest notices">
        {notices.length === 0 ? (
          <p className="text-sm text-subtle">No notices yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {notices.map((n) => (
              <li key={n.id} className={n.readAt ? "text-subtle" : ""}>
                <Link href={n.href ?? "/notifications"} className="hover:underline">
                  {!n.readAt && (
                    <span className="mr-1.5 inline-block size-2 rounded-full bg-accent" />
                  )}
                  <b>{n.title}</b>
                </Link>{" "}
                <span className="text-xs text-subtle">{formatDateTime(n.createdAt)}</span>
              </li>
            ))}
            <li>
              <Link href="/notifications" className="text-xs text-accent underline">
                All notifications
              </Link>
            </li>
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-base font-bold whitespace-nowrap sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-subtle sm:text-sm">{label}</p>
    </Card>
  );
}
