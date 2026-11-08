"use server";
import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { validCommission } from "@/lib/price-rules";
import type { AdminState } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { CartError } from "@/server/carts/errors";
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

const money = (label: string) =>
  z.string().trim().refine(validCommission, `Enter the ${label} with at most two decimals`);
const whole = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const agentSettingsSchema = z.object({
  courierPerItem: money("courier charge"),
  agentFeePerItem: money("agent fee"),
  gatewayFeeRate: z
    .string()
    .trim()
    .regex(/^0(\.\d{1,4})?$/, "Enter the gateway fee as a rate below 1, e.g. 0.033"),
  basketLockAmount: money("basket lock amount"),
  agentDeposit: money("agent deposit"),
  maxWaitDays: whole(1, 365),
  paymentHoldMinutes: whole(1, 240),
  collectHours: whole(1, 720),
  returnHandoverDays: whole(1, 60),
  agentRadiusM: whole(100, 50_000),
  agentGapM: whole(100, 50_000),
});

export async function saveAgentSettingsAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin("CORE");
  try {
    const data = agentSettingsSchema.parse(Object.fromEntries(fd));
    await db.settings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Check the form" };
    throw error;
  }
  await flash("Settings saved");
  revalidatePath("/admin/settings");
  return {};
}
