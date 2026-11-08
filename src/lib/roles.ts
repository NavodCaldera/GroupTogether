import type { Role } from "@/generated/prisma/client";

/** Buyers are customers and agents: an agent shops like anyone else. */
export const BUYER_ROLES: readonly Role[] = ["CUSTOMER", "AGENT"];

export const isBuyerRole = (role: Role | string) =>
  (BUYER_ROLES as readonly string[]).includes(role);
