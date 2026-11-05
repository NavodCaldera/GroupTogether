import "server-only";
import type { Settings } from "@/generated/prisma/client";
import { validCommission } from "@/lib/price-rules";
import { D } from "@/lib/decimal";
import { db, type Tx } from "./db";

/** The one settings row, created with the launch defaults the first time it is read. */
export async function getSettings(tx: Tx = db): Promise<Settings> {
  return (
    (await tx.settings.findUnique({ where: { id: 1 } })) ??
    (await tx.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }))
  );
}

export class SettingsError extends Error {}
export async function setCommission(adminId: string, amount: string): Promise<void> {
  const admin = await db.user.findUnique({
    where: { id: adminId },
    select: { role: true, adminArea: true, locked: true },
  });
  if (!admin || admin.role !== "ADMIN" || admin.adminArea !== "CORE" || admin.locked)
    throw new SettingsError("CORE admin access required");
  if (!validCommission(amount))
    throw new SettingsError("Enter a non-negative commission with at most two decimals");
  await getSettings();
  await db.settings.update({
    where: { id: 1 },
    data: { commissionPerPiece: new D(amount).toFixed(2) },
  });
}
