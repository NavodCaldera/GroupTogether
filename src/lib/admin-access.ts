export const ADMIN_AREAS = ["PREMIUM", "FACTORY", "WAREHOUSE"] as const;
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
  return "/";
}

export const ADMIN_AREA_LABEL: Record<string, string> = {
  PREMIUM: "Premium brands",
  FACTORY: "Factory apparel",
  WAREHOUSE: "Warehouse and delivery",
};
