import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { requireFactory } from "@/server/auth/session";
import { fillingBaskets } from "@/server/factory-dashboard";
import { FactoryShell } from "@/app/seller/factory-bits";
import { BasketTicket } from "../orders/basket-ticket";

export const metadata: Metadata = { title: "Filling baskets" };

/** Open baskets at each agent with their lines and total, against the configured lock amount. */
export default async function FillingBasketsPage() {
  const me = await requireFactory("baskets");
  const { baskets, lockAmount } = await fillingBaskets(me.id);
  return (
    <FactoryShell active="baskets" role={me.factoryRole} title="Filling baskets">
      <p className="mb-4 text-sm">
        <span className="text-subtle">Locks at </span>
        <span className="font-bold tabular-nums">{formatLKR(lockAmount)}</span>
      </p>
      {baskets.length === 0 ? (
        <EmptyState title="No baskets filling" />
      ) : (
        <ul aria-label="Filling baskets" className="flex flex-col gap-4">
          {baskets.map((b) => (
            <li key={b.id} aria-label={b.agent.user.name}>
              <BasketTicket basket={b} money packs={false} />
            </li>
          ))}
        </ul>
      )}
    </FactoryShell>
  );
}
