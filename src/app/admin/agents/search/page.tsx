import type { Metadata } from "next";
import { Badge, Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { searchOrders } from "@/server/agents/admin-screens";
import { requireAdmin } from "@/server/auth/session";
import { place } from "../agent-bits";

export const metadata: Metadata = { title: "Search orders" };

const ORDER: Record<string, string> = {
  PAID: "Paid",
  RECEIVED: "At agent",
  CANCELLED: "Cancelled",
  PENDING: "Pending",
};
const BASKET: Record<string, string> = {
  OPEN: "Open basket",
  LOCKED: "Locked",
  PACKED: "Packed",
  WITH_COURIER: "With courier",
  AT_AGENT: "Basket at agent",
};

export default async function SearchPage({ searchParams }: PageProps<"/admin/agents/search">) {
  const admin = await requireAdmin("AGENTS");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const orders = q ? await searchOrders(admin.id, q) : [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Search" />
      <form role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Order, code, phone or basket
        </label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Order, code, phone or basket"
          className="min-w-0 flex-1"
        />
        <Button type="submit">Search</Button>
      </form>
      {q && orders.length === 0 && <EmptyState title="No orders found" />}
      <ul className="grid gap-3 empty:hidden lg:grid-cols-2">
        {orders.map((o) => (
          <li key={o.id}>
            <Card className="flex min-w-0 flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold">
                    {o.buyer.name}
                    {o.buyer.phone ? ` · ${o.buyer.phone}` : ""}
                  </h2>
                  <p className="text-xs break-all text-subtle">{o.id}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge tone={o.status === "CANCELLED" ? "bad" : "info"}>
                    {ORDER[o.status] ?? o.status}
                  </Badge>
                  {o.basket && <Badge>{BASKET[o.basket.status]}</Badge>}
                </div>
              </div>
              <p>
                {place(o.factory)} → {o.agent.user.name} · {formatLKR(o.itemsTotal)}
                {o.paidAt ? ` · ${formatDateTime(o.paidAt)}` : ""}
              </p>
              {o.basket && <p className="text-xs break-all text-subtle">Basket {o.basket.id}</p>}
              <ul className="flex flex-col gap-1">
                {o.lines.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-2">
                    <span className="min-w-0 flex-1">
                      {l.variant.product.title} · {l.variant.size}
                      {l.variant.colour ? ` · ${l.variant.colour}` : ""}
                    </span>
                    <span className="tabular-nums">× {l.qty}</span>
                    {l.missingQty > 0 && <Badge tone="bad">{l.missingQty} missing</Badge>}
                    {l.returnedQty > 0 && <Badge>{l.returnedQty} returned</Badge>}
                    {l.collectedAt && <Badge tone="good">Collected</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
