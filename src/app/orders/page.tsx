import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { buyerOrders } from "@/server/orders/buyer";
import { OrderCard, splitOrders } from "./order-card";

export const metadata: Metadata = { title: "Orders" };

/** Item-first cards (2026-11-21): orders still moving first, then collected, delivered or cancelled. */
export default async function OrdersPage() {
  const user = await requireUser([...BUYER_ROLES], "/orders");
  const { orders, own, ownMinItems, lockAt } = await buyerOrders(user.id);
  const { active, past } = splitOrders(orders);
  const list = (title: string, id: string, items: typeof orders) =>
    items.length > 0 && (
      <section aria-labelledby={id} className="flex flex-col gap-3">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <ul className="flex flex-col gap-3">
          {items.map((o) => (
            <li key={o.id}>
              <OrderCard order={o} own={own} ownMinItems={ownMinItems} lockAt={lockAt} />
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Orders"
        actions={
          <LinkButton href="/own-baskets" variant="secondary">
            Own baskets
          </LinkButton>
        }
      />
      {orders.length === 0 ? (
        <EmptyState title="No orders yet">
          <Link href="/shop" className="font-medium text-accent underline">
            Shop
          </Link>
        </EmptyState>
      ) : (
        <>
          {list("In progress", "orders-active", active)}
          {list("Past", "orders-past", past)}
        </>
      )}
    </div>
  );
}
