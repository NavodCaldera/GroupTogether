import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PackingTrail } from "@/components/packing-bits";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { type QueueCart, packingQueue } from "@/server/packing";

export const metadata: Metadata = { title: "Packing" };

/**
 * The packing staff's board, for the admin (product owner, 2026-10-20): paid orders still to
 * gather, gathered and waiting to be packed, packed and waiting for PickMe, and today's
 * handovers, each with who checked, packed and handed it over. Read-only; each order opens its
 * admin cart page.
 */
export default async function AdminPackingPage() {
  await requireAdmin();
  const { toGather, toPack, ready, handedToday } = await packingQueue();

  return (
    <>
      <PageHeader
        title="Packing"
        description="Paid orders in the store: one person checks and gathers, someone else rechecks and packs, then it goes to the PickMe driver."
      />

      <Section title="To gather" n={toGather.length} empty="No paid orders waiting">
        {toGather.map((c) => (
          <OrderCard key={c.id} cart={c} note={`Confirmed ${formatDateTime(c.confirmedAt)}`} />
        ))}
      </Section>

      <Section title="Gathered, to pack" n={toPack.length} empty="Nothing gathered and waiting">
        {toPack.map((c) => (
          <OrderCard key={c.id} cart={c} />
        ))}
      </Section>

      <Section title="Packed, for PickMe" n={ready.length} empty="Nothing packed and waiting">
        {ready.map((c) => (
          <OrderCard
            key={c.id}
            cart={c}
            note={
              c.delivery
                ? `PickMe booked${c.delivery.driverName ? ` · ${c.delivery.driverName}` : ""}`
                : "PickMe not booked yet"
            }
          />
        ))}
      </Section>

      <Section title="Handed over today" n={handedToday.length} empty="None yet today">
        {handedToday.map((c) => (
          <OrderCard key={c.id} cart={c} />
        ))}
      </Section>
    </>
  );
}

function Section({
  title,
  n,
  empty,
  children,
}: {
  title: string;
  n: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">
        {title} ({n})
      </h2>
      {n === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

function OrderCard({ cart, note }: { cart: QueueCart; note?: string }) {
  return (
    <Card className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/admin/carts/${cart.code}`} className="font-mono font-semibold text-accent">
          {cart.code}
        </Link>
        <span className="text-xs text-subtle tabular-nums">
          {cart.items} {cart.items === 1 ? "item" : "items"}
        </span>
      </div>
      <p className="text-subtle">
        {cart.owner.name}
        {cart.deliveryCity && ` · ${cart.deliveryCity}`}
      </p>
      {cart.packing && <PackingTrail packing={cart.packing} />}
      {note && <p className="text-xs text-subtle">{note}</p>}
    </Card>
  );
}
