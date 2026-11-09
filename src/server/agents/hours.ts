import "server-only";
import type { Hours } from "@/lib/agent-rules";
import { agentOfUser, AgentError, withAgent } from "./common";
import { goLive } from "./deposit";

const DAY_MINUTES = 24 * 60;

function checkHours(hours: Hours): Hours {
  if (!Array.isArray(hours) || hours.length > 7) throw new AgentError("Check the opening hours");
  // Every agent keeps weekly opening hours, in every status (FR-029a).
  if (hours.length === 0) throw new AgentError("Open on at least one day");
  const days = new Set<number>();
  for (const h of hours) {
    const ok =
      h &&
      [h.weekday, h.opensAt, h.closesAt].every(Number.isInteger) &&
      h.weekday >= 0 &&
      h.weekday <= 6 &&
      h.opensAt >= 0 &&
      h.closesAt <= DAY_MINUTES &&
      h.opensAt < h.closesAt;
    if (!ok) throw new AgentError("Opening time must be before closing time");
    if (days.has(h.weekday)) throw new AgentError("Each day can have one opening time");
    days.add(h.weekday);
  }
  return hours.map((h) => ({ weekday: h.weekday, opensAt: h.opensAt, closesAt: h.closesAt }));
}

/** Replaces the agent's weekly opening hours in one transaction. An APPROVED agent whose deposit
 * was already recorded (it arrived while no hours were set) goes LIVE here.
 */
export async function setHours(agentUserId: string, hours: Hours): Promise<void> {
  const rows = checkHours(hours);
  const { id } = await agentOfUser(agentUserId);
  await withAgent(id, async (tx, agent) => {
    if (agent.status === "LEFT" || agent.status === "REJECTED") throw new AgentError("Not allowed");
    await tx.agentHours.deleteMany({ where: { agentId: agent.id } });
    await tx.agentHours.createMany({ data: rows.map((r) => ({ ...r, agentId: agent.id })) });
    if (agent.status === "APPROVED" && agent.depositPaidAt) await goLive(tx, agent);
  });
}
