import type { Metadata } from "next";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { pendingMissingReports } from "@/server/orders/delivery";
import { AdminForm } from "../../admin-form";
import { dismissMissingAction, removeMissingAction } from "./actions";

export const metadata: Metadata = { title: "Missing items" };

const BASKET: Record<string, string> = { LOCKED: "Locked", PACKED: "Packed" };

export default async function MissingItemsPage() {
  const admin = await requireAdmin("FACTORY");
  const lines = await pendingMissingReports(admin.id);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Missing items" />
      {lines.length === 0 && <EmptyState title="No missing items" />}
      <ul className="grid gap-3 empty:hidden lg:grid-cols-2">
        {lines.map((l) => (
          <li key={l.id}>
            <Card className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold">
                    {l.variant.product.title} · {l.variant.size}
                    {l.variant.colour ? ` · ${l.variant.colour}` : ""}
                  </h2>
                  <p className="text-sm text-subtle">
                    {l.order.factory.company || l.order.factory.name} →{" "}
                    {l.order.basket?.agent.user.name} · {l.order.buyer.name}
                  </p>
                </div>
                {l.order.basket && <Badge>{BASKET[l.order.basket.status] ?? "Shipped"}</Badge>}
              </div>
              <p className="text-lg font-semibold tabular-nums">
                {l.missingReportedQty} of {l.qty - l.missingQty} missing · {formatLKR(l.unitPrice)}{" "}
                each
              </p>
              {l.missingNote && <p className="text-sm break-words">{l.missingNote}</p>}
              <p className="text-xs text-subtle">{formatDateTime(l.missingReportedAt)}</p>
              <div className="flex flex-wrap gap-2">
                <AdminForm action={removeMissingAction} submit="Remove" variant="danger">
                  <input type="hidden" name="lineId" value={l.id} />
                </AdminForm>
                <AdminForm action={dismissMissingAction} submit="Dismiss" variant="secondary">
                  <input type="hidden" name="lineId" value={l.id} />
                </AdminForm>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
