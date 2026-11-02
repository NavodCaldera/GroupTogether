"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import type { AdminState } from "./admin-actions";
import { requireAdmin } from "./auth/session";
import { CatalogueError } from "./catalogue";
import { db } from "./db";
import { flash } from "./flash";
import { saveLot } from "./lots";

/** Bulk lots and the stock settings (product owner, 2026-10-21). */

function failure(e: unknown): AdminState {
  if (e instanceof CatalogueError) return { error: e.message };
  if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
  throw e;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function saveLotAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin("FACTORY");
  const id = str(fd, "id") || null;
  let savedId = id;
  try {
    const lot = await saveLot(id, Object.fromEntries(fd));
    savedId = lot.id;
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/shop");
  await flash(id ? "Saved" : "Lot created");
  if (!id) redirect(`/admin/lots/${savedId}`);
  return {};
}

const stockSettingsSchema = z
  .object({
    storeCapacity: z.coerce
      .number({ message: "Enter the store size in pieces" })
      .int("Enter whole pieces")
      .min(1, "Enter the store size in pieces")
      .max(10_000_000),
    fullMarginPct: z.coerce.number().int("Enter a whole percent").min(0).max(500),
    reducedMarginPct: z.coerce.number().int("Enter a whole percent").min(0).max(500),
    fullMarginDays: z.coerce.number().int("Enter whole days").min(0).max(365),
  })
  .refine((v) => v.reducedMarginPct <= v.fullMarginPct, {
    message: "The later margin can't be above the first",
  });

export async function saveStockSettingsAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin("CORE");
  try {
    const data = stockSettingsSchema.parse(Object.fromEntries(fd));
    await db.settings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/admin", "layout");
  await flash("Saved");
  return {};
}
