import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Toast } from "@/components/toast";
import { PageHeader, cx } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requirePacker } from "@/server/auth/session";
import { type QueueCart, packingQueue } from "@/server/packing";
import { stockToReceive } from "@/server/receiving";

export const metadata: Metadata = { title: "Packing" };

/**
 * The packing staff's list on their phones: sellers' stock to receive (accepted offers, 2026-10-20),
 * then paid orders to check and gather, to recheck and pack (someone else), and to hand to PickMe,
 * oldest first. Kept to the fewest words (product owner,
 * 2026-10-19). Each card opens the order's picking list.
 */
export default async function PackingPage({ searchParams }: PageProps<"/packing">) {
  const staff = await requirePacker();
  const { done, cart } = await searchParams;
  const code = typeof cart === "string" ? cart : "";
  const [{ toGather, toPack, ready, handedToday }, toReceive] = await Promise.all([
    packingQueue(),
    stockToReceive(),
  ]);
  // Someone else packs what this person gathered.
  const gatheredByMe = (c: QueueCart) => c.packing?.gatheredById === staff.id;

  return (
    <>
      {done === "gathered" && <Toast>{code} gathered.</Toast>}
      {done === "handed" && <Toast>{code} handed over.</Toast>}
      {done === "received" && <Toast>{code} received.</Toast>}
      <PageHeader title="Packing" />

      <Section title="To receive" n={toReceive.length}>
        {toReceive.map((o) => (
          <li key={o.id} className="relative rounded-xl border border-line p-3 hover:bg-muted/50">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/packing/stock/${o.id}`}
                className="min-w-0 font-semibold break-words text-accent after:absolute after:inset-0 after:rounded-xl"
              >
                {o.name}
              </Link>
              <span aria-hidden className="text-sm">
                ›
              </span>
            </div>
            <p className="mt-1 text-xs text-subtle">
              From {o.seller.company || o.seller.name}
              {o.seller.city && ` · ${o.seller.city}`}
            </p>
          </li>
        ))}
      </Section>

      <Section title="To gather" n={toGather.length}>
        {toGather.map((c) => (
          <OrderCard key={c.id} cart={c} />
        ))}
      </Section>

      <Section title="To pack" n={toPack.length}>
        {toPack.map((c) => (
          <OrderCard key={c.id} cart={c} faded={gatheredByMe(c)}>
            {gatheredByMe(c) && "Gathered by you"}
          </OrderCard>
        ))}
      </Section>

      <Section title="For PickMe" n={ready.length}>
        {ready.map((c) => (
          <OrderCard key={c.id} cart={c}>
            {c.delivery ? (
              <span className="font-medium text-accent">
                Booked{c.delivery.driverName && ` · ${c.delivery.driverName}`}
              </span>
            ) : (
              "Not booked yet"
            )}
          </OrderCard>
        ))}
      </Section>

      {handedToday.length > 0 && (
        <Section title="Handed over today" n={handedToday.length}>
          {handedToday.map((c) => (
            <OrderCard key={c.id} cart={c} faded>
              {formatDateTime(c.packing!.handedOverAt)}
            </OrderCard>
          ))}
        </Section>
      )}
    </>
  );
}

function Section({ title, n, children }: { title: string; n: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">
        {title} <span className="font-normal text-subtle tabular-nums">{n}</span>
      </h2>
      {n === 0 ? (
        <p className="text-sm text-subtle">None</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

/** One order; the whole card opens its picking list. */
function OrderCard({
  cart,
  faded,
  children,
}: {
  cart: QueueCart;
  faded?: boolean;
  children?: ReactNode;
}) {
  return (
    <li
      className={cx(
        "relative rounded-xl border border-line p-3 hover:bg-muted/50",
        faded && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/packing/${cart.code}`}
          className="font-mono font-semibold text-accent after:absolute after:inset-0 after:rounded-xl"
        >
          {cart.code}
        </Link>
        <span className="text-sm tabular-nums">
          {cart.items} {cart.items === 1 ? "item" : "items"} <span aria-hidden>›</span>
        </span>
      </div>
      {children && <p className="mt-1 text-xs text-subtle">{children}</p>}
    </li>
  );
}
