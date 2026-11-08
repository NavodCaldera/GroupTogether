import type { Metadata } from "next";
import { AgentShell, AgentStatusBadge } from "@/components/agent-shell";
import { db } from "@/server/db";
import { requireAgent } from "@/server/auth/session";
import { HoursForm } from "../agent-forms";

export const metadata: Metadata = { title: "Opening hours" };

export default async function AgentHours() {
  const { agent } = await requireAgent();
  const hours = await db.agentHours.findMany({
    where: { agentId: agent.id },
    select: { weekday: true, opensAt: true, closesAt: true },
    orderBy: { weekday: "asc" },
  });
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
