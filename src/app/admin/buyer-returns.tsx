import { ReturnCard } from "@/components/return-card";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { BUYER_FAULT_LABEL, BUYER_FAULT_REASONS } from "@/lib/return-rules";
import { buyerFaultHistory } from "@/server/returns";

/** Buyer-fault returns (DEC-017): requests first, then every outcome, and reason counts per
 * product. The Agents and orders admin decides; the Core admin only reads. */
export async function BuyerReturns({ adminId, decide }: { adminId: string; decide: boolean }) {
  const { rows, products } = await buyerFaultHistory(adminId);
  const waiting = rows.filter((r) => r.status === "BUYER_REQUESTED");
  const rest = rows.filter((r) => r.status !== "BUYER_REQUESTED");
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Buyer returns" />
      <section aria-labelledby="buyer-requests" className="flex flex-col gap-3">
        <h2 id="buyer-requests" className="text-lg font-semibold">
          Requests ({waiting.length})
        </h2>
        {!waiting.length && <EmptyState title="No requests" />}
        {waiting.map((r) => (
          <ReturnCard key={r.id} request={r} viewer={decide ? "agents" : "admin"} />
        ))}
      </section>
      <section aria-labelledby="buyer-products" className="flex flex-col gap-3">
        <h2 id="buyer-products" className="text-lg font-semibold">
          By product
        </h2>
        {!products.length && <EmptyState title="No buyer returns" />}
        {products.map((p) => (
          <Card key={p.productId} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">{p.title}</p>
              <p className="text-sm text-subtle">{p.factory}</p>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 text-sm tabular-nums">
              {BUYER_FAULT_REASONS.filter((reason) => p.counts[reason]).map((reason) => (
                <div key={reason} className="contents">
                  <dt>{BUYER_FAULT_LABEL[reason]}</dt>
                  <dd className="text-right">{p.counts[reason]}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </section>
      <section aria-labelledby="buyer-history" className="flex flex-col gap-3">
        <h2 id="buyer-history" className="text-lg font-semibold">
          History
        </h2>
        {!rest.length && <EmptyState title="No history" />}
        {rest.map((r) => (
          <ReturnCard key={r.id} request={r} viewer="admin" />
        ))}
      </section>
    </div>
  );
}
