import "server-only";
import { D } from "@/lib/decimal";
import { resolveCommission } from "@/lib/categories";
import { type CommissionRate, validCommission, validCommissionPct } from "@/lib/price-rules";
import { loadCategoryTree } from "./categories";
import { db } from "./db";
import { SettingsError } from "./settings";

/**
 * Sets a category's commission percent and minimum per unit (DEAL-004); blank clears a value so
 * it is inherited again. Only the core admin, who owns commission (DEAL-004). New listings and
 * deals going live use it; listings already saved keep their snapshot.
 */
export async function setCategoryCommission(
  adminId: string,
  categoryId: string,
  pct: string,
  min: string,
): Promise<void> {
  const admin = await db.user.findUnique({
    where: { id: adminId },
    select: { role: true, adminArea: true, locked: true },
  });
  if (!admin || admin.role !== "ADMIN" || admin.adminArea !== "CORE" || admin.locked)
    throw new SettingsError("CORE admin access required");
  if (pct && !validCommissionPct(pct))
    throw new SettingsError("Enter a percent from 0 to 100 with at most two decimals");
  if (min && !validCommission(min))
    throw new SettingsError("Enter a non-negative minimum with at most two decimals");
  const { count } = await db.category.updateMany({
    where: { id: categoryId },
    data: {
      commissionPct: pct ? new D(pct).toFixed(2) : null,
      minCommission: min ? new D(min).toFixed(2) : null,
    },
  });
  if (!count) throw new SettingsError("Category not found");
}

/** Each category's inherited commission percent and minimum, for buyer price previews. */
export async function commissionRates(): Promise<Record<string, CommissionRate>> {
  const tree = await loadCategoryTree();
  return Object.fromEntries([...tree.keys()].map((id) => [id, resolveCommission(tree, id)]));
}
