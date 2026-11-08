import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminBadges } from "@/server/admin-queries";
import {
  authenticate,
  hashToken,
  setUserLocked,
  startSession,
  userForToken,
} from "@/server/auth/service";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { makeAgent, makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

describe("locking a customer", () => {
  it("signs them out everywhere and blocks sign-in until unlocked", async () => {
    const u = await makeUser();
    await db.user.update({
      where: { id: u.id },
      data: { passwordHash: await hashPassword("password123") },
    });
    const { token } = await startSession(u.id);
    await startSession(u.id);

    await setUserLocked(u.id, true);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.session.findUnique({ where: { id: hashToken(token) } })).toBeNull();
    await expect(authenticate(u.email, "password123")).rejects.toThrow("locked");

    await setUserLocked(u.id, false);
    const back = await authenticate(u.email, "password123");
    const again = await startSession(back.id);
    expect(await userForToken(again.token)).toMatchObject({ id: u.id });
  });

  it("refuses to lock an admin", async () => {
    const admin = await makeUser("ADMIN");
    await expect(setUserLocked(admin.id, true)).rejects.toThrow("can't be locked");
  });
});

describe("tab counts", () => {
  it("counts only each area's own work", async () => {
    await makeAgent({ status: "APPLIED" });
    const agents = await adminBadges("unused", "AGENTS");
    expect(agents).toMatchObject({ applications: 1, courier: 0, payouts: 0, missing: 0 });
    expect(Object.keys(agents)).not.toContain("slips");
    expect(Object.keys(agents)).not.toContain("orders");
    expect((await adminBadges("unused", "CORE")).applications).toBe(0);
  });
});
