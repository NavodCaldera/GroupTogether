import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PackingTrail } from "@/components/packing-bits";
import { Button, Card, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { factoryFulfilment } from "@/lib/fulfilment";
import { ORDER_STAGE_LABEL, type OrderStage } from "@/lib/packing-rules";
import { bookDeliveryAction, deliveryStatusAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { type OrderRow, ordersBoard } from "@/server/orders";
import { AdminForm } from "../admin-form";
import { FilterSelect } from "../filter-select";
import { Chip, ChipRow, Count, param } from "../list-bits";

export const metadata: Metadata = { title: "Orders" };

const STAGES = (Object.keys(ORDER_STAGE_LABEL) as OrderStage[]).filter(
  (s) => s !== "factory-packing" || factoryFulfilment(),
);

/**
 * Every paid order from payment to delivery (product owner, 2026-10-21; replaces Packing and
 * Deliveries). The only place to book PickMe and to mark a drop delivered or failed. Packing
 * progress is shown, not changed: the packers do that on their phones.
 */
export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdmin("AGENTS");
  const board = await ordersBoard();
  const sp = await searchParams;
  const asked = STAGES.find((s) => s === param(sp, "stage"));
  // The admin's work first: to book, then failed drops; otherwise what is in the store.
  const stage =
    asked ?? (board["to-book"].length ? "to-book" : board.failed.length ? "failed" : "in-store");
  const rows = board[stage];
  const label = (s: OrderStage) =>
    s === "delivered" ? ORDER_STAGE_LABEL[s] : `${ORDER_STAGE_LABEL[s]} (${board[s].length})`;

  return (
    <>
      <PageHeader
        title="Orders"
        actions={
          <a
            href="/admin/export/orders?days=30"
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm hover:bg-muted sm:min-h-10"
          >
            Export CSV
          </a>
        }
      />
      <FilterSelect
        action="/admin/orders"
        name="stage"
        label="Stage"
        value={stage}
        options={STAGES.map((s) => ({ value: s, label: label(s) }))}
      />
      <ChipRow className="hidden sm:flex">
        {STAGES.map((s) => (
          <Chip key={s} href={`/admin/orders?stage=${s}`} active={s === stage}>
            {ORDER_STAGE_LABEL[s]}
            {s !== "delivered" && (
              <Count
                n={board[s].length}
                tone={s === "to-book" || s === "failed" ? "alert" : "muted"}
              />
            )}
          </Chip>
        ))}
      </ChipRow>

      {rows.length === 0 ? (
        <EmptyState title="None" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </ul>
      )}
    </>
  );
}

function OrderCard({ order: o }: { order: OrderRow }) {
  const d = o.delivery;
  return (
    <li>
      <Card className="flex h-full flex-col gap-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/admin/carts/${o.code}`}
            className="font-mono font-semibold text-accent underline"
          >
            {o.code}
          </Link>
          <span className="text-xs text-subtle tabular-nums">
            {o.items} {o.items === 1 ? "item" : "items"}
          </span>
        </div>
        <p>
          {o.owner.name} · {o.deliveryPhone}
          <span className="block text-subtle">
            {o.deliveryAddress}, {o.deliveryCity}
          </span>
        </p>
        {!factoryFulfilment() && <PackingTrail packing={o.packing} />}
        {d && o.stage !== "to-book" && (
          <p className="text-xs text-subtle">
            {[
              o.stage === "delivered" ? `Delivered ${formatDateTime(d.updatedAt)}` : null,
              d.externalRef,
              d.driverName,
              d.quotedFee ? `Fee ${formatLKR(d.quotedFee)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {d.trackingUrl && (
              <>
                {" · "}
                <a
                  href={d.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline"
                >
                  Track
                </a>
              </>
            )}
          </p>
        )}
        {o.stage === "to-book" && <BookForm cartId={o.id} open="Book PickMe" />}
        {o.stage === "failed" && <BookForm cartId={o.id} open="Book again" />}
        {o.stage === "in-store" && d && factoryFulfilment() && (
          <div className="mt-auto flex flex-wrap gap-2">
            <StatusButton id={d.id} status="PICKED_UP">
              Picked up
            </StatusButton>
            <StatusButton id={d.id} status="FAILED">
              Failed
            </StatusButton>
          </div>
        )}
        {(o.stage === "on-the-way" || o.stage === "failed") && d && (
          <div className="mt-auto flex flex-wrap gap-2">
            <StatusButton id={d.id} status="DELIVERED">
              Delivered
            </StatusButton>
            {o.stage === "on-the-way" && (
              <StatusButton id={d.id} status="FAILED">
                Failed
              </StatusButton>
            )}
          </div>
        )}
      </Card>
    </li>
  );
}

const FIELDS: [string, string, { type?: string; inputMode?: "decimal" }?][] = [
  ["externalRef", "PickMe booking ref"],
  ["quotedFee", "Fee (LKR)", { inputMode: "decimal" }],
  ["trackingUrl", "Tracking link (optional)", { type: "url" }],
  ["driverName", "Driver name"],
];

/** The booking form opens on the card itself. */
function BookForm({ cartId, open }: { cartId: string; open: string }) {
  return (
    <details className="mt-auto group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg bg-accent px-4 text-sm font-medium text-on-accent group-open:mb-3 sm:min-h-10 [&::-webkit-details-marker]:hidden">
        {open}
      </summary>
      <AdminForm action={bookDeliveryAction} submit="Mark as booked">
        <input type="hidden" name="cartId" value={cartId} />
        {FIELDS.map(([name, text, extra]) => (
          <Field key={name} label={text} name={`${name}-${cartId}`}>
            <Input id={`${name}-${cartId}`} name={name} {...extra} />
          </Field>
        ))}
      </AdminForm>
    </details>
  );
}

function StatusButton({
  id,
  status,
  children,
}: {
  id: string;
  status: "PICKED_UP" | "DELIVERED" | "FAILED";
  children: ReactNode;
}) {
  return (
    <form action={deliveryStatusAction}>
      <input type="hidden" name="deliveryId" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button variant={status === "FAILED" ? "danger" : "secondary"}>{children}</Button>
    </form>
  );
}
