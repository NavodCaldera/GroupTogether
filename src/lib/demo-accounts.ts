/** The seeded demo accounts (prisma/seed.ts), shown on the sign-in page outside production. */
export const DEMO_PASSWORD = "password123";

export type DemoAccount = { role: string; name: string; email: string; lands: string };

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: "Premium admin",
    name: "Premium Admin",
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
    role: "Warehouse admin",
    name: "Warehouse Admin",
    email: "warehouse@groupbasket.lk",
    lands: "/admin/warehouse",
  },
  {
    role: "Factory seller",
    name: "Nuwan · Ceylon Footwear Mills",
    email: "seller@example.com",
    lands: "/seller",
  },
  {
    role: "Luxury brand",
    name: "Amaya · Serendib Atelier",
    email: "brand@example.com",
    lands: "/seller",
  },
  { role: "Packing staff", name: "Kasun Perera", email: "packer@example.com", lands: "/packing" },
  {
    role: "Packing staff",
    name: "Ishara Fernando",
    email: "packer2@example.com",
    lands: "/packing",
  },
  { role: "Buyer", name: "Dilan Wickramasinghe", email: "buyer@example.com", lands: "/dashboard" },
  { role: "Buyer", name: "Sachini Gunawardena", email: "buyer2@example.com", lands: "/dashboard" },
  { role: "Buyer", name: "Tharindu Senanayake", email: "buyer3@example.com", lands: "/dashboard" },
];

/** Demo logins show in development, or anywhere with SHOW_DEMO_LOGINS=true (never by default in production). */
export function showDemoLogins(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== "production" || env.SHOW_DEMO_LOGINS === "true";
}
