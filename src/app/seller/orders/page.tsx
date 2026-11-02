import type { Metadata } from "next";
import { AdminForm } from "@/app/admin/admin-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { markFactoryPackedAction } from "@/server/factory-order-actions";
import { factoryOrders } from "@/server/factory-orders";

export const metadata: Metadata = { title: "Orders" };

const DELIVERY = {
  BOOKED: { label: "PickMe booked", tone: "info" },
  PICKED_UP: { label: "On the way", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "good" },
  FAILED: { label: "Drop failed", tone: "bad" },
  CANCELLED: { label: "Drop cancelled", tone: "bad" },
} as const;

/**
 * The factory's paid orders (product owner, 2026-11-03): what to pack, a button once it is
 * packed, then the PickMe driver and tracking. No buyer names or phones.
 */
export default async function FactoryOrdersPage() {
  const seller = await requireSeller();
  const orders = await factoryOrders(seller.id);
  return (
    <>
      <PageHeader title="Orders" />
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => {
            const d = o.delivery && DELIVERY[o.delivery.status];
            return (
              <li key={o.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">
                    {o.code}
                    <span className="ml-2 text-sm text-subtle">
                      {o.confirmedAt && formatDate(o.confirmedAt)}
                      {o.deliveryCity && ` · ${o.deliveryCity}`}
                    </span>
                  </p>
                  {d ? (
                    <Badge tone={d.tone}>{d.label}</Badge>
                  ) : o.factoryPackedAt ? (
                    <Badge tone="good">Packed</Badge>
                  ) : (
                    <Badge tone="info">To pack</Badge>
                  )}
                </div>
                <ul className="mt-2 text-sm">
                  {o.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>
                        {l.variant.product.title} · {l.variant.size}
                        {l.variant.colour && ` · ${l.variant.colour}`}
                      </span>
                      <span className="tabular-nums">× {l.qty}</span>
                    </li>
                  ))}
                </ul>
                {o.delivery && (o.delivery.driverName || o.delivery.trackingUrl) && (
                  <p className="mt-2 text-sm">
                    {o.delivery.driverName}
                    {o.delivery.trackingUrl && (
                      <a
                        href={o.delivery.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-accent underline"
                      >
                        Track
                      </a>
                    )}
                  </p>
                )}
                {o.status === "CONFIRMED" && !o.factoryPackedAt && (
                  <AdminForm action={markFactoryPackedAction} submit="Mark packed" className="mt-3">
                    <input type="hidden" name="cartId" value={o.id} />
                  </AdminForm>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
