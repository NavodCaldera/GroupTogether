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
import type { Role } from "@/generated/prisma/client";
import { type SessionUser, endSession, homeFor, startSession, userForToken } from "./service";

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
export const requirePacker = () => requireUser(["PACKER"]);
