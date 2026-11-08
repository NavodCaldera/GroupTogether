/**
 * The seeded demo accounts (prisma/seed.ts), shown on the sign-in page outside production, and
 * the stable identifiers browser specs use to find seeded rows without hard-coding ids.
 * Client-safe: no server imports.
 */
import { adminHome } from "./admin-access";

export const DEMO_PASSWORD = "password123";

export type DemoAccount = { role: string; name: string; email: string; lands: string };

/** Factory logins: the factory account is its owner; Packing and Sales are staff logins. */
export const DEMO_FACTORIES = {
  ceylon: {
    company: "Ceylon Apparel Mills",
    owner: "seller@example.com",
    packing: "packing@example.com",
    sales: "sales@example.com",
  },
  lanka: {
    company: "Lanka Knit Works",
    owner: "seller2@example.com",
    packing: "packing2@example.com",
    sales: "sales2@example.com",
  },
} as const;

/** Agent logins. `kollupitiya` is the main seeded agent; `applicant` has only applied. */
export const DEMO_AGENTS = {
  kollupitiya: "agent@example.com",
  wellawatte: "agent2@example.com",
  kotahena: "agent3@example.com",
  applicant: "applicant@example.com",
} as const;

export const DEMO_ADMINS = {
  AGENTS: "buyers@groupbasket.lk",
  FACTORY: "factory@groupbasket.lk",
  CORE: "core@groupbasket.lk",
  PREMIUM: "premium@groupbasket.lk",
} as const;

export const DEMO_BUYERS = {
  dilan: "buyer@example.com",
  sachini: "buyer2@example.com",
  tharindu: "buyer3@example.com",
  nimali: "buyer4@example.com",
  ravindu: "buyer5@example.com",
  ayesha: "buyer6@example.com",
} as const;

/** Dilan's pickup code at the main agent: his parcel waits there, uncollected. */
export const DEMO_PICKUP_CODE = "246810";

/** What specs rely on. Find a basket by its agent login, factory owner login and status. */
export const DEMO = {
  /** Has a READY code (DEMO_PICKUP_CODE) at DEMO_AGENTS.kollupitiya */
  readyBuyer: DEMO_BUYERS.dilan,
  readyAgent: DEMO_AGENTS.kollupitiya,
  /** Holds tokens (a cancelled order's refund) */
  tokenBuyer: DEMO_BUYERS.tharindu,
  /** Has a return AWAITING_HANDOVER at DEMO_AGENTS.kollupitiya */
  returnBuyer: DEMO_BUYERS.sachini,
  returnAgent: DEMO_AGENTS.kollupitiya,
  baskets: {
    OPEN: { agent: DEMO_AGENTS.wellawatte, factory: DEMO_FACTORIES.lanka.owner },
    LOCKED: { agent: DEMO_AGENTS.wellawatte, factory: DEMO_FACTORIES.ceylon.owner },
    PACKED: { agent: DEMO_AGENTS.kotahena, factory: DEMO_FACTORIES.ceylon.owner },
    WITH_COURIER: { agent: DEMO_AGENTS.kollupitiya, factory: DEMO_FACTORIES.lanka.owner },
    AT_AGENT: { agent: DEMO_AGENTS.kollupitiya, factory: DEMO_FACTORIES.ceylon.owner },
  },
} as const;

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: "Core admin", name: "Core Admin", email: DEMO_ADMINS.CORE, lands: adminHome("CORE") },
  {
    role: "Luxury brand admin",
    name: "Luxury Brand Admin",
    email: DEMO_ADMINS.PREMIUM,
    lands: adminHome("PREMIUM"),
  },
  {
    role: "Factory admin",
    name: "Factory Admin",
    email: DEMO_ADMINS.FACTORY,
    lands: adminHome("FACTORY"),
  },
  {
    role: "Agents and orders admin",
    name: "Agents Admin",
    email: DEMO_ADMINS.AGENTS,
    lands: adminHome("AGENTS"),
  },
  {
    role: "Factory owner",
    name: "Nuwan · Ceylon Apparel Mills",
    email: DEMO_FACTORIES.ceylon.owner,
    lands: "/seller",
  },
  {
    role: "Factory packing",
    name: "Ruwan · Ceylon Apparel Mills",
    email: DEMO_FACTORIES.ceylon.packing,
    lands: "/seller",
  },
  {
    role: "Factory sales",
    name: "Chamari · Ceylon Apparel Mills",
    email: DEMO_FACTORIES.ceylon.sales,
    lands: "/seller",
  },
  {
    role: "Factory owner",
    name: "Pradeep · Lanka Knit Works",
    email: DEMO_FACTORIES.lanka.owner,
    lands: "/seller",
  },
  {
    role: "Factory packing",
    name: "Lahiru · Lanka Knit Works",
    email: DEMO_FACTORIES.lanka.packing,
    lands: "/seller",
  },
  {
    role: "Factory sales",
    name: "Dinusha · Lanka Knit Works",
    email: DEMO_FACTORIES.lanka.sales,
    lands: "/seller",
  },
  {
    role: "Luxury brand",
    name: "Amaya · Serendib Atelier",
    email: "brand@example.com",
    lands: "/seller",
  },
  { role: "Agent", name: "Kamal Perera", email: DEMO_AGENTS.kollupitiya, lands: "/agent" },
  { role: "Agent", name: "Fathima Rizwan", email: DEMO_AGENTS.wellawatte, lands: "/agent" },
  { role: "Agent", name: "Suresh Kumar", email: DEMO_AGENTS.kotahena, lands: "/agent" },
  { role: "Agent applicant", name: "Ishani Silva", email: DEMO_AGENTS.applicant, lands: "/" },
  { role: "Buyer", name: "Dilan Wickramasinghe", email: DEMO_BUYERS.dilan, lands: "/" },
  { role: "Buyer", name: "Sachini Gunawardena", email: DEMO_BUYERS.sachini, lands: "/" },
  { role: "Buyer", name: "Tharindu Senanayake", email: DEMO_BUYERS.tharindu, lands: "/" },
  { role: "Buyer", name: "Nimali Jayasuriya", email: DEMO_BUYERS.nimali, lands: "/" },
  { role: "Buyer", name: "Ravindu Bandara", email: DEMO_BUYERS.ravindu, lands: "/" },
  { role: "Buyer", name: "Ayesha Nazeer", email: DEMO_BUYERS.ayesha, lands: "/" },
];

/** Demo logins show in development, or anywhere with SHOW_DEMO_LOGINS=true (never by default in production). */
export function showDemoLogins(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== "production" || env.SHOW_DEMO_LOGINS === "true";
}
