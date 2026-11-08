import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/client";
import { EmptyState, PageHeader } from "@/components/ui";
import { STATUS_LABEL, cartTotal } from "@/lib/cart-rules";
import { formatDate, formatLKR } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { myCarts } from "@/server/carts/queries";

export const metadata: Metadata = { title: "Past orders" };

const DONE = ["CONFIRMED", "DISPATCHED", "DELIVERED"];

/**
 * Read like a statement: one line per finished cart. The active cart lives on the dashboard.
 * Owners see the cart total (what they paid); members see their own items (what they owe the
 * owner). Expired and cancelled carts fold away below.
 */
export default async function PastOrdersPage() {
  const user = await requireUser([], "/my-carts");
  // Admins have no carts of their own; their view of carts is Admin → Carts.
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "SELLER") redirect("/seller");
  const carts = await myCarts(user.id);
  const orders = carts.filter((c) => DONE.includes(c.status));
  const closed = carts.filter((c) => !DONE.includes(c.status));

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink fallback="/dashboard" />
      <PageHeader title="Past orders" />
      {carts.length === 0 ? (
        <EmptyState title="No orders yet">
          <Link href="/carts" className="font-medium text-accent underline">
            Find an open cart
          </Link>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.length > 0 ? (
            <Rows carts={orders} userId={user.id} />
          ) : (
            <p className="text-sm text-subtle">No orders yet.</p>
          )}
          {closed.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm text-subtle hover:text-ink [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show</span>
                <span className="hidden group-open:inline">Hide</span> {closed.length} expired or
                cancelled
              </summary>
              <div className="mt-3">
                <Rows carts={closed} userId={user.id} />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Rows({ carts, userId }: { carts: Awaited<ReturnType<typeof myCarts>>; userId: string }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line text-sm">
      {carts.map((c) => {
        const mine = c.ownerId === userId;
        const amount = mine ? c.total : cartTotal(c.lines);
        const items = c.lines.reduce((n, l) => n + l.qty, 0);
        const tone = DONE.includes(c.status) ? "text-accent" : "text-subtle";
        return (
          <li key={c.id}>
            <Link
              href={`/c/${c.code}`}
              className="grid grid-cols-[3.5rem_1fr_auto_1rem] items-center gap-3 p-3 hover:bg-muted sm:grid-cols-[4rem_7rem_1fr_auto_1rem]"
            >
              <span className="text-subtle tabular-nums">
                {formatDate(c.confirmedAt ?? c.createdAt)}
              </span>
              <span className={`font-medium ${tone}`}>
                {STATUS_LABEL[c.status]}
                {!mine && (
                  <span className="block truncate text-xs font-normal text-subtle sm:hidden">
                    {c.owner.name.split(" ")[0]}&apos;s cart
                  </span>
                )}
              </span>
              <span className="hidden truncate text-subtle sm:block">
                {items} {items === 1 ? "item" : "items"}
                {!mine && ` · ${c.owner.name.split(" ")[0]}'s cart`}
              </span>
              <span className="text-right font-semibold tabular-nums">{formatLKR(amount)}</span>
              <span aria-hidden className="text-subtle">
                ›
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
