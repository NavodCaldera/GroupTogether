/** The seeded demo buyers (prisma/seed.ts), shown on the sign-in page outside production.
 * Client-safe: no server imports. */

export const DEMO_PASSWORD = "password123";

export type DemoAccount = { name: string; email: string };

export const DEMO_BUYERS = {
  dilan: "buyer@example.com",
  sachini: "buyer2@example.com",
  tharindu: "buyer3@example.com",
  nimali: "buyer4@example.com",
  ravindu: "buyer5@example.com",
  ayesha: "buyer6@example.com",
} as const;

/** Manages Hemas's company dashboard (/company). */
export const DEMO_COMPANY = "hemas@example.com";

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { name: "Dilan Wickramasinghe", email: DEMO_BUYERS.dilan },
  { name: "Sachini Gunawardena", email: DEMO_BUYERS.sachini },
  { name: "Tharindu Senanayake", email: DEMO_BUYERS.tharindu },
  { name: "Nimali Jayasuriya", email: DEMO_BUYERS.nimali },
  { name: "Ravindu Bandara", email: DEMO_BUYERS.ravindu },
  { name: "Ayesha Nazeer", email: DEMO_BUYERS.ayesha },
  { name: "Hemas (company)", email: DEMO_COMPANY },
];

/** Demo logins show in development, or anywhere with SHOW_DEMO_LOGINS=true. */
export function showDemoLogins(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== "production" || env.SHOW_DEMO_LOGINS === "true";
}
