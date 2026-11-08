"use server";
import { revalidatePath } from "next/cache";
import type { AdminState } from "@/server/admin-actions";
import { decideAgent, liftSuspension, recordLoss, suspendAgent } from "@/server/agents/admin";
import { requireAdmin } from "@/server/auth/session";
import { CartError } from "@/server/errors";
import { flash } from "@/server/flash";
import { bookCourier } from "@/server/orders/delivery";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/** Known refusals go back to the form; success pops up as a flash. */
async function attempt(work: () => Promise<unknown>, ok: string): Promise<AdminState> {
  try {
    await work();
  } catch (error) {
    if (error instanceof CartError) return { error: error.message };
    throw error;
  }
  await flash(ok);
  revalidatePath("/admin", "layout");
  return {};
}

export async function bookCourierAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("AGENTS");
  return attempt(
    () =>
      bookCourier(admin.id, text(fd, "basketId"), {
        fee: text(fd, "fee"),
        driverName: text(fd, "driverName"),
        driverPhone: text(fd, "driverPhone"),
        vehicleNo: text(fd, "vehicleNo"),
      }),
    "Courier booked",
  );
}

export async function decideAgentAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("AGENTS");
  const approve = text(fd, "decision") === "approve";
  return attempt(
    () => decideAgent(admin.id, text(fd, "agentId"), approve, text(fd, "note")),
    approve ? "Approved" : "Rejected",
  );
}

export async function suspendAgentAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("AGENTS");
  return attempt(
    () => suspendAgent(admin.id, text(fd, "agentId"), text(fd, "reason")),
    "Suspended",
  );
}

export async function liftSuspensionAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("AGENTS");
  return attempt(() => liftSuspension(admin.id, text(fd, "agentId")), "Suspension lifted");
}

export async function recordLossAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("AGENTS");
  const photos = fd.getAll("photos").filter((f): f is File => f instanceof File);
  return attempt(
    () => recordLoss(admin.id, text(fd, "agentId"), text(fd, "amount"), text(fd, "reason"), photos),
    "Loss recorded",
  );
}
