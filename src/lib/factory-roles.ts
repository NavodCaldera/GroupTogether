import type { FactoryRole } from "@/generated/prisma/client";

/**
 * Factory staff (product owner, 2026-11-04): each person has their own login and one fixed job.
 * Each job sees only its own sections; owners see every section and are the only ones who see
 * money (sales value, commission, payouts). The factory account itself is always an owner.
 */
export type FactorySection =
  "home" | "orders" | "products" | "insights" | "team" | "returns" | "earnings" | "baskets";

/** Three jobs only (FR-031): Planner work moved to Sales. */
export const FACTORY_ROLES: FactoryRole[] = ["OWNER", "PACKING", "SALES"];

export const FACTORY_ROLE_LABEL: Record<FactoryRole, string> = {
  OWNER: "Owner",
  PACKING: "Packing",
  SALES: "Sales",
};

const SECTIONS: Record<FactoryRole, FactorySection[]> = {
  OWNER: ["home", "orders", "products", "insights", "team", "returns", "earnings"],
  PACKING: ["home", "orders"],
  SALES: ["home", "products", "insights", "returns", "baskets"],
};

export const factorySections = (role: FactoryRole) => SECTIONS[role];

export const canFactory = (role: FactoryRole, section: FactorySection) =>
  SECTIONS[role].includes(section);

/** Only owners see rupee figures; staff see pieces. */
export const seesMoney = (role: FactoryRole) => role === "OWNER";

/** Who may publish or edit listings and change stock. */
export const editsListings = (role: FactoryRole) => role === "OWNER" || role === "SALES";

/** The factory account a login works for, and its job there. */
export function factoryOf(user: {
  id: string;
  factoryId: string | null;
  factoryRole: FactoryRole | null;
}): { factoryId: string; factoryRole: FactoryRole } {
  return user.factoryId
    ? { factoryId: user.factoryId, factoryRole: user.factoryRole ?? "PACKING" }
    : { factoryId: user.id, factoryRole: "OWNER" };
}
