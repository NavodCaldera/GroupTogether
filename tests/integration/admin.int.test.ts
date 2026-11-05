import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminBadges, salesStats } from "@/server/admin-queries";
import {
  authenticate,
  hashToken,
  setUserLocked,
  startSession,
  userForToken,
} from "@/server/auth/service";
import { hashPassword } from "@/server/auth/password";
import { markDone, acceptAndPay, createCart, setLine } from "@/server/carts/service";
import { approveSlip, uploadSlip } from "@/server/carts/slips";
import { db } from "@/server/db";
import { makeUser, makeVariant, resetDb, slipFile } from "./helpers";

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

describe("sales figures and tab counts", () => {
  it("counts a confirmed cart as a sale and open carts as locked stock", async () => {
    const [owner, member, admin] = [await makeUser(), await makeUser(), await makeUser("ADMIN")];
    const v = await makeVariant("25000", 10);

    const paid = await createCart(owner.id, { name: "Paid" });
    await setLine(owner.id, paid.id, v.id, 1);
    await setLine(member.id, paid.id, v.id, 1);
    await markDone(member.id, paid.id);
    await acceptAndPay(owner.id, paid.id, {
      deliveryAddress: "12 Flower Rd",
      deliveryCity: "Colombo",
      deliveryPhone: "0771234567",
    });
    await uploadSlip(owner.id, paid.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: paid.id } });
    await approveSlip(admin.id, slip.id);

    const open = await createCart(member.id, {});
    await setLine(member.id, open.id, v.id, 1);

    const s = await salesStats();
    expect(s.sales.today).toMatchObject({ orders: 1 });
    expect(s.sales.today.total.toFixed(2)).toBe("50000.00");
    expect(s.sales.month.orders).toBe(1);
    expect(s.locked.carts).toBe(1);
    expect(s.locked.total.toFixed(2)).toBe("25000.00");

    // The Orders tab counts the paid cart waiting for PickMe.
    expect((await adminBadges("unused", "WAREHOUSE")).orders).toBe(1);
  });
});
