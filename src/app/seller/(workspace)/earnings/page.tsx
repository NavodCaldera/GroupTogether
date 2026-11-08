import type { Metadata } from "next";
import { Badge, EmptyState } from "@/components/ui";
import { BackLink } from "@/components/client";
import { formatDate, formatLKR } from "@/lib/format";
import { requireFactory } from "@/server/auth/session";
import { factoryEarnings } from "@/server/factory-dashboard";
import { FactoryShell, Ticket } from "@/app/seller/factory-bits";
import { EarningsSummary } from "./earnings-bits";

export const metadata: Metadata = { title: "Earnings and payouts" };

const DEDUCTION: Record<string, string> = {
  RETURN_COURIER: "Return courier",
  MISSING_ITEM: "Missing items",
};

/** Owner only: this week's earnings, then each Sunday payout with its deductions. */
export default async function FactoryEarningsPage() {
  const me = await requireFactory("earnings");
  const e = await factoryEarnings(me.id);
  return (
    <FactoryShell active="earnings" role={me.factoryRole} title="Earnings and payouts">
      <div className="mb-3">
        <BackLink fallback="/seller" />
      </div>
      <section aria-labelledby="this-week" className="mb-6">
        <h2 id="this-week" className="mb-2 font-bold">
          This week
        </h2>
        <EarningsSummary e={e} />
      </section>
      <section aria-labelledby="payouts">
        <h2 id="payouts" className="mb-3 font-bold">
          Payouts
        </h2>
        {e.payouts.length === 0 ? (
          <EmptyState title="No payouts yet" />
        ) : (
          <ul aria-label="Payouts" className="flex flex-col gap-4">
            {e.payouts.map((p) => (
              <li key={p.id} aria-label={`Sunday ${formatDate(p.sunday)}`}>
                <Ticket
                  head={
                    <>
                      <span className="text-xl font-bold">Sun {formatDate(p.sunday)}</span>
                      {p.paidAt ? (
                        <Badge tone="good">Paid {formatDate(p.paidAt)}</Badge>
                      ) : (
                        <Badge tone="info">Due</Badge>
                      )}
                    </>
                  }
                  foot={
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-bold">Paid out</span>
                      <span className="text-xl font-bold tabular-nums">{formatLKR(p.net)}</span>
                    </div>
                  }
                >
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm tabular-nums">
                    <dt className="text-subtle">Earned</dt>
                    <dd className="text-right">{formatLKR(p.gross)}</dd>
                    {p.deductionRows.map((d) => (
                      <div key={d.id} className="contents">
                        <dt className="text-subtle">{DEDUCTION[d.kind] ?? d.kind}</dt>
                        <dd className="text-right">−{formatLKR(d.amount)}</dd>
                      </div>
                    ))}
                    {p.deductionRows.length === 0 && (
                      <>
                        <dt className="text-subtle">Deductions</dt>
                        <dd className="text-right">{formatLKR(p.deductions)}</dd>
                      </>
                    )}
                    {p.bankRef && (
                      <>
                        <dt className="text-subtle">Bank reference</dt>
                        <dd className="text-right break-all">{p.bankRef}</dd>
                      </>
                    )}
                  </dl>
                </Ticket>
              </li>
            ))}
          </ul>
        )}
      </section>
    </FactoryShell>
  );
}
