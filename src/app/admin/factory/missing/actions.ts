"use server";
import { revalidatePath } from "next/cache";
import type { AdminState } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { CartError } from "@/server/carts/errors";
import { flash } from "@/server/flash";
import { dismissMissingReport, removeMissingLine } from "@/server/orders/delivery";

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

const lineId = (fd: FormData) => String(fd.get("lineId") ?? "");

/** Removes the reported units: the buyer gets tokens, the factory's next payout a deduction. */
export async function removeMissingAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("FACTORY");
  return attempt(() => removeMissingLine(admin.id, lineId(fd)), "Line removed");
}

/** Clears a wrong report so the line ships and is paid. */
export async function dismissMissingAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("FACTORY");
  return attempt(() => dismissMissingReport(admin.id, lineId(fd)), "Report dismissed");
}
