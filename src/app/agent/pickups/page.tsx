import type { Metadata } from "next";
import { AgentShell, AgentStatusBadge } from "@/components/agent-shell";
import { Card, EmptyState } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { waitingForPickup } from "@/server/agents/screens";
import { requireAgent } from "@/server/auth/session";
import { HandOverBox } from "../agent-forms";

export const metadata: Metadata = { title: "Pickups" };

export default async function AgentPickups() {
  const { agent } = await requireAgent();
  const waiting = await waitingForPickup(agent.id);
  return (
    <AgentShell active="pickups" title="Pickups" badge={<AgentStatusBadge status={agent.status} />}>
      <Card>
        <HandOverBox />
      </Card>
      {waiting.length === 0 ? (
        <EmptyState title="No parcels waiting" />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {waiting.map((w) => (
            <li
              key={w.buyerId}
              className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5"
            >
              <span className="font-medium">{w.name}</span>
              <span className="text-sm text-subtle tabular-nums">
                {w.items} items · {formatLKR(w.fee)} · {formatDateTime(w.receivedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AgentShell>
  );
}
