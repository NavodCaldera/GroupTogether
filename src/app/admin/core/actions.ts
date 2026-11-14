"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { parseAgentSettings } from "@/lib/agent-settings";
import type { AdminState } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { CartError } from "@/server/errors";
import { db } from "@/server/db";
import { flash } from "@/server/flash";
import { markPayoutPaid } from "@/server/payouts";

export async function markPayoutPaidAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("CORE");
  try {
    await markPayoutPaid(
      admin.id,
      String(fd.get("payoutId") ?? ""),
      String(fd.get("bankRef") ?? ""),
    );
  } catch (error) {
    if (error instanceof CartError) return { error: error.message };
    throw error;
  }
  await flash("Marked paid");
  revalidatePath("/admin/core/payouts");
  return {};
}

export async function saveAgentSettingsAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin("CORE");
  try {
    const data = parseAgentSettings(Object.fromEntries(fd));
    await db.settings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check the form" };
    throw error;
  }
  await flash("Settings saved");
  revalidatePath("/admin/settings");
  return {};
}
