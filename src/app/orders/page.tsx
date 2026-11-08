import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { buyerOrders, orderTotal } from "@/server/orders/buyer";
import { BasketProgress, OrderBadge, factoryName } from "./order-bits";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
  const user = await requireUser([...BUYER_ROLES], "/orders");
  const { orders, lockAt } = await buyerOrders(user.id);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <PageHeader title="Orders" />
      {orders.length === 0 ? (
        <EmptyState title="No orders yet">
          <Link href="/shop" className="font-medium text-accent underline">
            Shop
          </Link>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/orders/${o.id}`}
                    className="inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline sm:min-h-10"
                  >
                    {factoryName(o.factory)}
                  </Link>
                  <OrderBadge
                    status={o.status}
                    collected={o.lines.every((l) => l.collectedAt || l.status !== "ACTIVE")}
                  />
                </div>
                <p className="text-sm text-subtle">
                  {formatDateTime(o.createdAt)} · {o.agent.user.name} · {formatLKR(orderTotal(o))}
                </p>
                {o.basket && o.status !== "CANCELLED" && (
                  <BasketProgress basket={o.basket} lockAt={lockAt} />
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
