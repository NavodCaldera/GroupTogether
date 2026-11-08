import type { Metadata } from "next";
import { EmptyState, cx } from "@/components/ui";
import { seesMoney } from "@/lib/factory-roles";
import { requireFactory } from "@/server/auth/session";
import { BASKET_STAGES, factoryBasketBoard } from "@/server/factory-dashboard";
import { FactoryShell } from "@/app/seller/factory-bits";
import { BasketTicket } from "./basket-ticket";

export const metadata: Metadata = { title: "Orders" };

/**
 * The factory's baskets by stage (area-agent model): Filling, Locked, Packed, With courier and At
 * agent with their counts, then each basket past Filling as a ticket. Never buyer names or phones.
 */
export default async function FactoryOrdersPage() {
  const me = await requireFactory("orders");
  const { counts, baskets } = await factoryBasketBoard(me.id);
  return (
    <FactoryShell active="orders" role={me.factoryRole} title="Orders">
      <ol aria-label="Baskets by stage" className="mb-5 grid grid-cols-5 text-center text-xs">
        {BASKET_STAGES.map(([s, name], i) => (
          <li
            key={s}
            aria-label={`${name}: ${counts[s]}`}
            className="relative flex flex-col items-center gap-1"
          >
            {/* The line joins the stages: a basket moves left to right. */}
            {i > 0 && (
              <span aria-hidden className="absolute top-4 right-1/2 h-0.5 w-full bg-line" />
            )}
            <span
              aria-hidden
              className={cx(
                "relative grid size-8 place-items-center rounded-full border-2 bg-paper text-sm font-bold tabular-nums",
                counts[s] === 0 && "border-line text-subtle",
                counts[s] > 0 && s === "LOCKED" && "border-accent bg-accent text-on-accent",
                counts[s] > 0 && s !== "LOCKED" && "border-ink",
              )}
            >
              {counts[s]}
            </span>
            <span aria-hidden className="leading-tight">
              {name}
            </span>
          </li>
        ))}
      </ol>
      {baskets.length === 0 ? (
        <EmptyState title="No baskets yet" />
      ) : (
        <ul aria-label="Baskets" className="flex flex-col gap-4">
          {baskets.map((b) => (
            <li key={b.id} aria-label={b.agent.user.name}>
              <BasketTicket basket={b} money={seesMoney(me.factoryRole)} packs />
            </li>
          ))}
        </ul>
      )}
    </FactoryShell>
  );
}
