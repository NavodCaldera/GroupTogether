import type { Metadata } from "next";
import { AgentShell, AgentStatusBadge } from "@/components/agent-shell";
import { BackLink } from "@/components/client";
import { PageHeader } from "@/components/ui";
import { db } from "@/server/db";
import { requireAgentHours } from "@/server/auth/session";
import { HoursForm } from "../agent-forms";

export const metadata: Metadata = { title: "Opening hours" };

export default async function AgentHours() {
  const { agent } = await requireAgentHours();
  const hours = await db.agentHours.findMany({
    where: { agentId: agent.id },
    select: { weekday: true, opensAt: true, closesAt: true },
    orderBy: { weekday: "asc" },
  });
  // An approved applicant sets hours before the deposit; the agent tabs open once live.
  if (agent.status === "APPROVED")
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
        <BackLink fallback="/agents/apply" />
        <PageHeader title="Opening hours" />
        <HoursForm hours={hours} />
      </div>
    );
  return (
    <AgentShell
      active="hours"
      title="Opening hours"
      badge={<AgentStatusBadge status={agent.status} />}
    >
      <HoursForm hours={hours} />
    </AgentShell>
  );
}
