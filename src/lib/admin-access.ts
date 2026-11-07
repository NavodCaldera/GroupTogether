/**
 * Four admins (product owner, 2026-11-03): luxury brands, factories, buyers and orders (stored
 * as WAREHOUSE), and the core admin, who only runs settings and admin accounts.
 */
export const ADMIN_AREAS = ["PREMIUM", "FACTORY", "WAREHOUSE", "CORE"] as const;
export type OperationalAdminArea = (typeof ADMIN_AREAS)[number];
export type AdminPrincipal = { role: string; adminArea?: string | null; locked?: boolean };

/** The admin's own workspace, or null for anyone who isn't an unlocked admin with one. */
export function adminAreaOf(user: AdminPrincipal | null | undefined): OperationalAdminArea | null {
  if (!user || user.role !== "ADMIN" || user.locked) return null;
  return ADMIN_AREAS.find((a) => a === user.adminArea) ?? null;
}

/** Every admin works in exactly one area; there is no unrestricted admin (ADMIN-002). */
export function canAdminArea(
  user: AdminPrincipal | null | undefined,
  area: OperationalAdminArea,
): boolean {
  return adminAreaOf(user) === area;
}

/** The area responsible for an account: brands are premium, factory sellers factory, the rest warehouse. */
export function userAdminArea(user: {
  role: string;
  isBrand?: boolean;
  adminArea?: string | null;
}): OperationalAdminArea | null {
  if (user.role === "ADMIN") return adminAreaOf(user);
  if (user.role === "SELLER") return user.isBrand ? "PREMIUM" : "FACTORY";
  return "WAREHOUSE";
}

export function adminHome(area: string | null | undefined): string {
  if (area === "PREMIUM") return "/admin/brands";
  if (area === "FACTORY") return "/admin/factory";
  if (area === "WAREHOUSE") return "/admin/warehouse";
  if (area === "CORE") return "/admin/users";
  return "/";
}

export const ADMIN_AREA_LABEL: Record<string, string> = {
  PREMIUM: "Luxury brands",
  FACTORY: "Factories",
  WAREHOUSE: "Buyers and orders",
  CORE: "Core",
};

/** Stored value of the "Agents and orders" admin area; Task 13 of the agent model flips it to "AGENTS". */
export const AGENTS_AREA = "WAREHOUSE" as const;
