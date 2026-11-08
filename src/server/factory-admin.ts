import "server-only";
import { requireAdmin } from "./auth/session";
import { db } from "./db";

/** The factory admin's home figures. */
export async function factoryDashboard() {
  await requireAdmin("FACTORY");
  const factories = await db.user.count({
    where: { role: "SELLER", isBrand: false, factoryId: null, locked: false },
  });
  return { factories };
}
