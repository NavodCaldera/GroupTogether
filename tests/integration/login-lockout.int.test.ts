import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authenticate, AuthError } from "@/server/auth/service";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { makeUser, resetDb } from "./helpers";

const now = new Date("2026-11-05T06:00:00Z");
const lockMessage = "Too many sign-in attempts. Try again in 10 minutes.";
const password = "password123";
beforeEach(resetDb);
afterAll(() => db.$disconnect());

async function account() {
  const user = await makeUser();
  return db.user.update({
    where: { id: user.id },
    data: { email: "user@x.lk", passwordHash: await hashPassword(password) },
  });
}
async function fail(email: string, count = 5, at = now) {
  for (let i = 0; i < count; i++) {
    await expect(authenticate(email, "wrong", at)).rejects.toThrow(
      "Email or password is incorrect",
    );
  }
}
const attempt = (email = "user@x.lk") => db.loginAttempt.findUnique({ where: { email } });

describe("email login lockout", () => {
  it("clears four failures on successful sign-in", async () => {
    const user = await account();
    await fail(user.email, 4);
    expect(await attempt()).toMatchObject({ failures: 4, lockedUntil: null });
    expect(await authenticate(user.email, password, now)).toMatchObject({ id: user.id });
    expect(await attempt()).toBeNull();
  });
  it("locks on the fifth failure and refuses the correct password without extending the lock", async () => {
    await account();
    await fail("user@x.lk");
    const lockedUntil = new Date(now.getTime() + 600_000);
    expect(await attempt()).toMatchObject({ failures: 5, lockedUntil });
    await expect(
      authenticate("user@x.lk", password, new Date(now.getTime() + 1000)),
    ).rejects.toThrow(lockMessage);
    expect(await attempt()).toMatchObject({ failures: 5, lockedUntil });
  });
  it("allows a correct password after expiry and deletes the counter", async () => {
    await account();
    await fail("user@x.lk");
    await authenticate("user@x.lk", password, new Date(now.getTime() + 601_000));
    expect(await attempt()).toBeNull();
  });
  it("locks unknown emails with the same message as existing accounts", async () => {
    await account();
    for (const email of ["user@x.lk", "unknown@x.lk"]) {
      await fail(email);
      expect(await attempt(email)).toMatchObject({
        failures: 5,
        lockedUntil: new Date(now.getTime() + 600_000),
      });
      await expect(authenticate(email, password, now)).rejects.toThrow(lockMessage);
    }
  });
  it("does not lose failures under ten concurrent wrong attempts", async () => {
    await account();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => authenticate("user@x.lk", "wrong", now)),
    );
    expect(results.every((r) => r.status === "rejected" && r.reason instanceof AuthError)).toBe(
      true,
    );
    expect((await attempt())!.failures).toBeGreaterThanOrEqual(5);
    expect((await attempt())!.lockedUntil).toEqual(new Date(now.getTime() + 600_000));
    await expect(authenticate("user@x.lk", password, now)).rejects.toThrow(lockMessage);
  });
  it("normalises email before counting failures", async () => {
    await account();
    await fail(" User@X.lk ", 3);
    await fail("user@x.lk", 2);
    expect(await db.loginAttempt.count()).toBe(1);
    await expect(authenticate(" USER@X.LK ", password, now)).rejects.toThrow(lockMessage);
  });
  it("starts at one failure when the lock expires, including exactly at expiry", async () => {
    await account();
    await fail("user@x.lk");
    await fail("user@x.lk", 1, new Date(now.getTime() + 600_000));
    expect(await attempt()).toMatchObject({ failures: 1, lockedUntil: null });
  });
  it("counts wrong passwords for administratively locked users and preserves their correct-password message", async () => {
    const user = await account();
    await db.user.update({ where: { id: user.id }, data: { locked: true } });
    await fail(user.email, 1);
    expect(await attempt()).toMatchObject({ failures: 1 });
    await expect(authenticate(user.email, password, now)).rejects.toThrow(
      "This account is locked. Contact support.",
    );
  });
});
