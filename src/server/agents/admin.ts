import "server-only";
import type { AgentStatus } from "@/generated/prisma/client";
import { clashesWith } from "@/lib/agent-rules";
import { D } from "@/lib/decimal";
import { validCommission } from "@/lib/price-rules";
import { db } from "../db";
import { getSettings } from "../settings";
import { notify } from "../notify";
import { checkUpload, IMAGE_TYPES, saveUpload, UploadError } from "../storage";
import {
  ACTIVE_STATUSES,
  AgentError,
  cleanNote,
  lockOpenBaskets,
  requireAgentsAdmin,
  withAgent,
} from "./common";

/** Serializes approvals so two applicants near each other cannot both pass the gap check. */
const APPROVALS_KEY = "agent-approvals";
const MAX_LOSS_PHOTOS = 6;
const LOSS_STATUSES: AgentStatus[] = ["LIVE", "SUSPENDED", "LEAVING"];

/** Agents and orders admin approves or rejects an APPLIED agent. Approval is refused when the
 * pin is within agentGapM of any active agent.
 */
export async function decideAgent(
  adminId: string,
  agentId: string,
  approve: boolean,
  note: string,
): Promise<void> {
  await requireAgentsAdmin(adminId);
  const text = cleanNote(note, !approve, "reason");
  const userId = await withAgent(
    agentId,
    async (tx, agent) => {
      if (agent.status !== "APPLIED") throw new AgentError("This application is already decided");
      if (approve) {
        const { agentGapM } = await getSettings(tx);
        const others = await tx.agent.findMany({
          where: { id: { not: agent.id }, status: { in: ACTIVE_STATUSES } },
          select: { lat: true, lng: true },
        });
        if (clashesWith(agent, others, agentGapM))
          throw new AgentError(
            `Another agent is within ${new D(agentGapM).div(1000).toString()} km`,
          );
      }
      await tx.agent.update({
        where: { id: agent.id },
        data: { status: approve ? "APPROVED" : "REJECTED", statusNote: approve ? null : text },
      });
      return agent.userId;
    },
    [APPROVALS_KEY],
  );
  await notify(
    [userId],
    approve
      ? { title: "Application approved", body: "Pay the deposit to go live.", href: "/agent" }
      : { title: "Application not approved", body: text ?? "" },
  );
}

/** Stops new orders and locks every OPEN basket early; buyers still collect there. */
export async function suspendAgent(
  adminId: string,
  agentId: string,
  reason: string,
): Promise<void> {
  await requireAgentsAdmin(adminId);
  const text = cleanNote(reason, true, "reason");
  const userId = await withAgent(agentId, async (tx, agent) => {
    if (agent.status !== "LIVE") throw new AgentError("Only a live agent can be suspended");
    const now = new Date();
    await tx.agent.update({
      where: { id: agent.id },
      data: { status: "SUSPENDED", suspendedAt: now, statusNote: text },
    });
    await lockOpenBaskets(tx, agent.id, now);
    return agent.userId;
  });
  await notify([userId], { title: "Suspended", body: text ?? "" });
}

/** SUSPENDED -> LIVE. Baskets already locked stay locked and ship. */
export async function liftSuspension(adminId: string, agentId: string): Promise<void> {
  await requireAgentsAdmin(adminId);
  const userId = await withAgent(agentId, async (tx, agent) => {
    if (agent.status !== "SUSPENDED") throw new AgentError("This agent is not suspended");
    await tx.agent.update({
      where: { id: agent.id },
      data: { status: "LIVE", suspendedAt: null, statusNote: null },
    });
    return agent.userId;
  });
  await notify([userId], { title: "Suspension lifted", body: "You are taking orders again." });
}

/** A loss the agent caused, taken from the deposit when they leave. */
export async function recordLoss(
  adminId: string,
  agentId: string,
  amount: string,
  reason: string,
  photos: File[],
): Promise<void> {
  await requireAgentsAdmin(adminId);
  if (typeof amount !== "string" || !validCommission(amount.trim()) || new D(amount.trim()).lte(0))
    throw new AgentError("Enter a positive amount with at most two decimals");
  const value = new D(amount.trim());
  const text = cleanNote(reason, true, "reason")!;
  const files = (photos ?? []).filter((f) => f instanceof File && f.size > 0);
  if (files.length === 0) throw new AgentError("Add a photo of the loss");
  if (files.length > MAX_LOSS_PHOTOS) throw new AgentError(`Add at most ${MAX_LOSS_PHOTOS} photos`);
  for (const f of files) {
    try {
      checkUpload(f, IMAGE_TYPES, "photo");
    } catch (e) {
      if (e instanceof UploadError) throw new AgentError(e.message);
      throw e;
    }
  }
  const before = await db.agent.findUnique({ where: { id: agentId }, select: { status: true } });
  if (!before || !LOSS_STATUSES.includes(before.status))
    throw new AgentError("Losses can only be recorded for an active agent");

  const photoKeys: string[] = [];
  for (const f of files)
    photoKeys.push((await saveUpload(f, "agent-losses", IMAGE_TYPES)).storageKey);

  await withAgent(agentId, async (tx, agent) => {
    // Re-checked under the lock: once LEFT the deposit has been settled.
    if (!LOSS_STATUSES.includes(agent.status))
      throw new AgentError("Losses can only be recorded for an active agent");
    await tx.agentLoss.create({
      data: {
        agentId: agent.id,
        amount: value.toFixed(2),
        reason: text,
        photoKeys,
        decidedById: adminId,
      },
    });
    await tx.agent.update({
      where: { id: agent.id },
      data: { lossAmount: { increment: value.toFixed(2) } },
    });
  });
}
