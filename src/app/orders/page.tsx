import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { buyerOrders } from "@/server/orders/buyer";
import { STAGE_LABEL } from "@/lib/order-stage";
import { OrderCard, type OrderGroup, groupByStage, groupOf } from "./order-card";

export const metadata: Metadata = { title: "Orders" };

/** Orders still on their way to the buyer: the count on each tab. */
const moving = (groups: ReturnType<typeof groupByStage>) =>
  groups
    .filter((g) => g.stage !== "delivered" && g.stage !== "refunded")
    .reduce((n, g) => n + g.orders.length, 0);

const TABS: { key: OrderGroup; label: string }[] = [
  { key: "pickup", label: "Agent pickup" },
  { key: "mine", label: "My baskets" },
  { key: "joined", label: "Joined baskets" },
];

/**
 * Three tabs (owner, 2026-11-21): Pickup (through an agent), My baskets (own baskets the buyer
 * started) and Joined (other buyers' own baskets). Each lists its orders by stage (DEC-026).
 */
export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await requireUser([...BUYER_ROLES], "/orders");
  const [{ orders, own, ownMinItems, lockAt }, sp] = await Promise.all([
    buyerOrders(user.id),
    searchParams,
  ]);
  const groups = new Map(
    TABS.map((t) => [t.key, groupByStage(orders.filter((o) => groupOf(o, user.id) === t.key))]),
  );
  const asked = TABS.find((t) => t.key === sp.tab)?.key;
  // With no tab asked for: the first with something in progress, else the first with anything.
  const tab =
    asked ??
    TABS.find((t) => moving(groups.get(t.key)!) > 0)?.key ??
    TABS.find((t) => groups.get(t.key)!.length > 0)?.key ??
    "pickup";
  const shown = groups.get(tab)!;

  const list = (title: string, id: string, items: typeof orders) =>
    items.length > 0 && (
      <section key={id} aria-labelledby={id} className="flex flex-col gap-3">
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
                  {moving(g) > 0 && (
                    <span
                      className={`shrink-0 rounded-full px-1.5 text-xs tabular-nums ${now ? "bg-accent text-paper" : "bg-paper text-ink"}`}
                    >
                      {moving(g)}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          {shown.length === 0 ? (
            <EmptyState title="Nothing here yet" />
          ) : (
            <>
              {shown.map((g) =>
                list(`${STAGE_LABEL[g.stage]} · ${g.orders.length}`, `orders-${g.stage}`, g.orders),
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
