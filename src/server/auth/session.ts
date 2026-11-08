import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  adminAreaOf,
  adminHome,
  canAdminArea,
  type OperationalAdminArea,
} from "@/lib/admin-access";
import { canFactory, factoryOf, type FactorySection } from "@/lib/factory-roles";
import type { Role } from "@/generated/prisma/client";
import { db } from "../db";
import {
  type SessionUser,
  assertAgent,
  endSession,
  homeFor,
  startSession,
  userForToken,
} from "./service";

const COOKIE = "gt_session";

export async function signInAs(userId: string) {
  const { token, expiresAt } = await startSession(userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await endSession(token);
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? userForToken(token) : null;
});

/**
 * Data-access-layer guard: call at the top of every page, server action and route handler
 * that needs a signed-in user. `next` is where to come back to after signing in.
 */
export async function requireUser(roles: Role[] = [], next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  if (roles.length > 0 && !roles.includes(user.role)) redirect(homeFor(user.role, user.adminArea));
  return user;
}

export async function requireAdmin(area: OperationalAdminArea) {
  const user = await requireUser(["ADMIN"]);
  if (!canAdminArea(user, area)) redirect(adminHome(user.adminArea));
  return user;
}

/** Any admin, with their own area, for pages each area sees a part of (Users, Settings). */
export async function requireAnyAdmin() {
  const user = await requireUser(["ADMIN"]);
  const area = adminAreaOf(user);
  if (!area) redirect("/");
  return { ...user, adminArea: area };
}
export const requireSeller = () => requireUser(["SELLER"]);
/**
 * A factory login (owner or staff, 2026-11-04) allowed into `section`: who they are, the factory
 * account they work for, and their job there. Luxury brands go to their own dashboard.
 */
export async function requireFactory(section: FactorySection) {
  const user = await requireSeller();
  const me = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, isBrand: true, factoryId: true, factoryRole: true },
  });
  if (me.isBrand) redirect("/seller");
  const { factoryId, factoryRole } = factoryOf(me);
  if (!canFactory(factoryRole, section)) redirect(section === "home" ? "/" : "/seller");
  return { ...user, factoryId, factoryRole };
}
/**
 * An agent login with a LIVE, SUSPENDED or LEAVING agent row, and that row. The role stays AGENT
 * after an agent has left, so the row's status decides.
 */
export async function requireAgent() {
  const user = await requireUser(["AGENT"]);
  try {
    return { ...user, agent: await assertAgent(user.id) };
  } catch {
    redirect("/dashboard");
  }
}
