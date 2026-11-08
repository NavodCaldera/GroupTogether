import type { Metadata } from "next";
import { AgentShell, AgentStatusBadge, Section } from "@/components/agent-shell";
import { Countdown } from "@/components/client";
import { Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { heldReturns, returnsToCollect } from "@/server/agents/screens";
import { requireAgent } from "@/server/auth/session";
import { CollectButton } from "../agent-forms";

export const metadata: Metadata = { title: "Returns" };

export default async function AgentReturns() {
  const { agent } = await requireAgent();
  const [toCollect, held] = await Promise.all([returnsToCollect(agent.id), heldReturns(agent.id)]);
  return (
    <AgentShell active="returns" title="Returns" badge={<AgentStatusBadge status={agent.status} />}>
      <Section title="To collect" count={toCollect.length}>
        {toCollect.length === 0 ? (
          <p className="text-sm text-subtle">None</p>
        ) : (
          toCollect.map((r) => (
            <Card key={r.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{r.buyer}</p>
                {r.dueAt && (
                  <span className="text-sm text-warn">
                    <Countdown until={r.dueAt.toISOString()} />
                  </span>
                )}
              </div>
              <p className="text-sm">
                {r.item} × {r.qty}
              </p>
              <CollectButton returnId={r.id} />
            </Card>
          ))
        )}
      </Section>
      <Section title="To send back" count={held.length}>
        {held.length === 0 ? (
          <p className="text-sm text-subtle">None</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {held.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {r.item} × {r.qty}
                </span>
                <span className="text-subtle">{formatDateTime(r.handedOverAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AgentShell>
  );
}
