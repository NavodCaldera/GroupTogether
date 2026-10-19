import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Toast } from "@/components/toast";
import { PageHeader, cx } from "@/components/ui";
import { CHECKS_NEEDED } from "@/lib/packing-rules";
import { formatDateTime } from "@/lib/format";
import { requirePacker } from "@/server/auth/session";
import { type QueueCart, packingQueue } from "@/server/packing";

export const metadata: Metadata = { title: "Packing" };

/**
 * The packing staff's list on their phones: paid orders to pack, to check (two people) and to
 * hand to PickMe, oldest first. Kept to the fewest words (product owner, 2026-10-19). Each card
 * opens the order's picking list.
 */
export default async function PackingPage({ searchParams }: PageProps<"/packing">) {
  const staff = await requirePacker();
  const { done, cart } = await searchParams;
  const code = typeof cart === "string" ? cart : "";
  const { toPack, toCheck, ready, handedToday } = await packingQueue();
  // Orders this person can't check: they packed it (never their own) or already checked it.
  const packedByMe = (c: QueueCart) => c.packing?.packedById === staff.id;
  const checkedByMe = (c: QueueCart) =>
    c.packing?.checks.some((k) => k.userId === staff.id) ?? false;

  return (
    <>
      {done === "checked" && <Toast>{code} checked.</Toast>}
      {done === "handed" && <Toast>{code} handed over.</Toast>}
      <PageHeader title="Packing" />

      <Section title="To pack" n={toPack.length}>
        {toPack.map((c) => (
          <OrderCard key={c.id} cart={c} />
        ))}
      </Section>

      <Section title="To check" n={toCheck.length}>
        {toCheck.map((c) => (
          <OrderCard key={c.id} cart={c} faded={packedByMe(c) || checkedByMe(c)}>
            {c.packing!.checks.length}/{CHECKS_NEEDED} checked
            {packedByMe(c) && " · packed by you"}
            {checkedByMe(c) && " · checked by you"}
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
