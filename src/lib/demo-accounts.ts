/** The seeded demo accounts (prisma/seed.ts), shown on the sign-in page outside production. */
export const DEMO_PASSWORD = "password123";

export type DemoAccount = { role: string; name: string; email: string; lands: string };

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: "Admin", name: "Admin", email: "admin@grouptogether.lk", lands: "/admin" },
  {
    role: "Factory seller",
    name: "Nuwan · Ceylon Footwear Mills",
    email: "seller@example.com",
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
