/**
 * The seeded demo accounts (prisma/seed.ts), shown on the sign-in page outside production.
 * Packing staff are seeded but not listed while factories pack orders (2026-11-03).
 */
export const DEMO_PASSWORD = "password123";

export type DemoAccount = { role: string; name: string; email: string; lands: string };

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: "Core admin", name: "Core Admin", email: "core@groupbasket.lk", lands: "/admin/users" },
  {
    role: "Luxury brand admin",
    name: "Luxury Brand Admin",
    email: "premium@groupbasket.lk",
    lands: "/admin/brands",
  },
  {
    role: "Factory admin",
    name: "Factory Admin",
    email: "factory@groupbasket.lk",
    lands: "/admin/factory",
  },
  {
    role: "Buyers admin",
    name: "Buyers Admin",
    email: "buyers@groupbasket.lk",
    lands: "/admin/warehouse",
  },
  {
    role: "Factory",
    name: "Nuwan · Ceylon Apparel Mills",
    email: "seller@example.com",
    lands: "/seller",
  },
  {
    role: "Luxury brand",
    name: "Amaya · Serendib Atelier",
    email: "brand@example.com",
    lands: "/seller",
  },
  { role: "Buyer", name: "Dilan Wickramasinghe", email: "buyer@example.com", lands: "/dashboard" },
  { role: "Buyer", name: "Sachini Gunawardena", email: "buyer2@example.com", lands: "/dashboard" },
  { role: "Buyer", name: "Tharindu Senanayake", email: "buyer3@example.com", lands: "/dashboard" },
];

/** Demo logins show in development, or anywhere with SHOW_DEMO_LOGINS=true (never by default in production). */
export function showDemoLogins(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== "production" || env.SHOW_DEMO_LOGINS === "true";
}
