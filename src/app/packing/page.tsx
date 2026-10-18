import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { checkedByText } from "@/components/packing-bits";
import { Toast } from "@/components/toast";
import { EmptyState, PageHeader, cx } from "@/components/ui";
import { CHECKS_NEEDED } from "@/lib/packing-rules";
import { formatDateTime } from "@/lib/format";
import { requirePacker } from "@/server/auth/session";
import { type QueueCart, packingQueue } from "@/server/packing";

export const metadata: Metadata = { title: "Packing" };

/**
 * The packing staff's list on their phones: paid orders to pack, to check (two people) and to
 * hand to PickMe, oldest first. Each card opens the order's picking list.
 */
export default async function PackingPage({ searchParams }: PageProps<"/packing">) {
  const staff = await requirePacker();
  const { done, cart } = await searchParams;
  const code = typeof cart === "string" ? cart : "";
  const { toPack, toCheck, ready, handedToday } = await packingQueue();
  const mine = (c: QueueCart) => c.packing?.checks.some((k) => k.userId === staff.id) ?? false;

  return (
    <>
      {done === "checked" && <Toast>Your check on {code} is saved.</Toast>}
      {done === "handed" && <Toast>{code} handed to PickMe. Thank you!</Toast>}
      <PageHeader
        title="Packing"
        description="Pack each paid order, have two people check it, then hand it to the PickMe driver."
      />
      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile n={toPack.length} label="To pack" href="#to-pack" />
        <Tile n={toCheck.filter((c) => !mine(c)).length} label="To check" href="#to-check" />
        <Tile n={ready.length} label="For PickMe" href="#ready" />
      </div>

      <Section id="to-pack" title="To pack" n={toPack.length} empty="Nothing to pack">
        {toPack.map((c) => (
          <OrderCard key={c.id} cart={c}>
            Paid {formatDateTime(c.confirmedAt)}
          </OrderCard>
        ))}
      </Section>

      <Section id="to-check" title="To check" n={toCheck.length} empty="Nothing to check">
        {toCheck.map((c) => (
          <OrderCard key={c.id} cart={c} faded={mine(c)}>
            Packed by {c.packing!.packedBy.name} · {c.packing!.checks.length} of {CHECKS_NEEDED}{" "}
            checks
            {mine(c) && (
              <span className="block">You checked it. Someone else must check it too.</span>
            )}
          </OrderCard>
        ))}
      </Section>

      <Section
        id="ready"
        title="Ready for PickMe"
        n={ready.length}
        empty="Nothing waiting for PickMe"
      >
        {ready.map((c) => (
          <OrderCard key={c.id} cart={c}>
            {checkedByText(c.packing)}
            <span className={cx("block", c.delivery && "font-medium text-accent")}>
              {c.delivery
                ? `PickMe booked${c.delivery.externalRef ? ` · ${c.delivery.externalRef}` : ""}${c.delivery.driverName ? ` · ${c.delivery.driverName}` : ""}`
                : "Waiting for the PickMe booking"}
            </span>
          </OrderCard>
        ))}
      </Section>

      {handedToday.length > 0 && (
        <Section id="done" title="Handed to PickMe today" n={handedToday.length} empty="">
          {handedToday.map((c) => (
            <OrderCard key={c.id} cart={c} faded>
              By {c.packing!.handedOverBy?.name} · {formatDateTime(c.packing!.handedOverAt)}
            </OrderCard>
          ))}
        </Section>
      )}
    </>
  );
}

function Tile({ n, label, href }: { n: number; label: string; href: string }) {
  return (
    <a
      href={href}
      className={cx(
        "rounded-xl border p-3 hover:bg-muted",
        n > 0 ? "border-accent" : "border-line text-subtle",
      )}
    >
      <span className={cx("block text-2xl font-semibold tabular-nums", n > 0 && "text-accent")}>
        {n}
      </span>
      <span className="text-xs">{label}</span>
    </a>
  );
}

function Section({
  id,
  title,
  n,
  empty,
  children,
}: {
  id: string;
  title: string;
  n: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-2">
      <h2 className="font-semibold">
        {title} ({n})
      </h2>
      {n === 0 ? <EmptyState title={empty} /> : <ul className="flex flex-col gap-2">{children}</ul>}
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
  children: ReactNode;
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
      <p className="truncate text-sm">
        {cart.owner.name}
        {cart.deliveryCity && <span className="text-subtle"> · {cart.deliveryCity}</span>}
      </p>
      <p className="mt-1 text-xs text-subtle">{children}</p>
    </li>
  );
}
