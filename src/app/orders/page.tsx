import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { buyerOrders } from "@/server/orders/buyer";
import { OrderCard, type OrderGroup, groupOf, splitOrders } from "./order-card";

export const metadata: Metadata = { title: "Orders" };

const TABS: { key: OrderGroup; label: string }[] = [
  { key: "pickup", label: "Agent pickup" },
  { key: "mine", label: "My baskets" },
  { key: "joined", label: "Joined baskets" },
];

/**
 * Three tabs (owner, 2026-11-21): Pickup (through an agent), My baskets (own baskets the buyer
 * started) and Joined (other buyers' own baskets). Each lists In progress, then Past.
 */
export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await requireUser([...BUYER_ROLES], "/orders");
  const [{ orders, own, ownMinItems, lockAt }, sp] = await Promise.all([
    buyerOrders(user.id),
    searchParams,
  ]);
  const groups = new Map(
    TABS.map((t) => [t.key, splitOrders(orders.filter((o) => groupOf(o, user.id) === t.key))]),
  );
  const asked = TABS.find((t) => t.key === sp.tab)?.key;
  // With no tab asked for: the first with something in progress, else the first with anything.
  const tab =
    asked ??
    TABS.find((t) => groups.get(t.key)!.active.length > 0)?.key ??
    TABS.find((t) => groups.get(t.key)!.past.length > 0)?.key ??
    "pickup";
  const { active, past } = groups.get(tab)!;

  const list = (title: string, id: string, items: typeof orders) =>
    items.length > 0 && (
      <section aria-labelledby={id} className="flex flex-col gap-3">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <ul className="flex flex-col gap-3">
          {items.map((o) => (
            <li key={o.id}>
              <OrderCard
                order={o}
                own={own}
                ownMinItems={ownMinItems}
                lockAt={lockAt}
                viewerId={user.id}
              />
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="Orders" />
      {orders.length === 0 ? (
        <EmptyState title="No orders yet">
          <Link href="/shop" className="font-medium text-accent underline">
            Shop
          </Link>
        </EmptyState>
      ) : (
        <>
          <nav aria-label="Order groups" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {TABS.map((t) => {
              const g = groups.get(t.key)!;
              const now = t.key === tab;
              return (
                <Link
                  key={t.key}
                  href={`/orders?tab=${t.key}`}
                  replace
                  scroll={false}
                  aria-current={now ? "page" : undefined}
                  className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-1 py-1.5 text-center text-sm leading-tight font-medium sm:whitespace-nowrap transition-colors sm:min-h-10 ${
                    now ? "bg-paper text-ink shadow-sm" : "text-subtle hover:text-ink"
                  }`}
                >
                  {t.label}
                  {g.active.length > 0 && (
                    <span
                      className={`shrink-0 rounded-full px-1.5 text-xs tabular-nums ${now ? "bg-accent text-paper" : "bg-paper text-ink"}`}
                    >
                      {g.active.length}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          {active.length + past.length === 0 ? (
            <EmptyState title="Nothing here yet" />
          ) : (
            <>
              {list("In progress", "orders-active", active)}
              {list("Past", "orders-past", past)}
            </>
          )}
        </>
      )}
    </div>
  );
}
