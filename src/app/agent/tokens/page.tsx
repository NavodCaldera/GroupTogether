import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { AgentShell, AgentStatusBadge, Section } from "@/components/agent-shell";
import { Card } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { agentTokens } from "@/server/agents/screens";
import { requireAgent } from "@/server/auth/session";
import { LeaveButton, SendTokensForm } from "../agent-forms";

export const metadata: Metadata = { title: "Tokens" };

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold whitespace-nowrap tabular-nums">{value}</p>
      <p className="text-sm text-subtle">{label}</p>
    </div>
  );
}

export default async function AgentTokens() {
  const { agent } = await requireAgent();
  const t = await agentTokens(agent);
  const canLeave = agent.status === "LIVE" || agent.status === "SUSPENDED";
  return (
    <AgentShell active="tokens" title="Tokens" badge={<AgentStatusBadge status={agent.status} />}>
      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-3xl font-semibold tabular-nums">{formatLKR(t.balance)}</p>
          <p className="text-sm text-subtle">Balance</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Figure label="Agent fees" value={formatLKR(t.fees)} />
          <Figure label="Courier repaid" value={formatLKR(t.courier)} />
        </div>
      </Card>

      <Section title="Send tokens">
        <Card>
          <SendTokensForm requestKey={randomUUID()} />
        </Card>
      </Section>

      <Section title="Deposit">
        <Card className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Figure label="Paid" value={formatLKR(t.deposit)} />
            <Figure label="Losses" value={formatLKR(t.losses)} />
          </div>
          {t.depositPaidAt && (
            <p className="text-sm text-subtle">{formatDateTime(t.depositPaidAt)}</p>
          )}
          {canLeave && <LeaveButton />}
        </Card>
      </Section>

      <Section title="History">
        {t.entries.length === 0 ? (
          <p className="text-sm text-subtle">None</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {t.entries.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-1 px-3 py-2 text-sm">
                <span>
                  {e.note}
                  <span className="ml-2 text-subtle">{formatDateTime(e.createdAt)}</span>
                </span>
                <span className="font-medium tabular-nums">{formatLKR(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AgentShell>
  );
}
