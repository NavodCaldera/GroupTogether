import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { dailySales, overviewStats } from "@/server/admin-queries";
import {
  authenticate,
  hashToken,
  setUserLocked,
  startSession,
  userForToken,
} from "@/server/auth/service";
import { hashPassword } from "@/server/auth/password";
import { acceptAndPay, createCart, setLine } from "@/server/carts/service";
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

describe("overview figures", () => {
  it("counts a confirmed cart as a sale and open carts as locked stock", async () => {
    const [owner, member, admin] = [await makeUser(), await makeUser(), await makeUser("ADMIN")];
    const v = await makeVariant("25000", 10);

    const paid = await createCart(owner.id, { name: "Paid" });
    await setLine(owner.id, paid.id, v.id, 1);
    await setLine(member.id, paid.id, v.id, 1);
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

    const s = await overviewStats();
    expect(s.sales.today).toMatchObject({ orders: 1 });
    expect(s.sales.today.total.toFixed(2)).toBe("50000.00");
    expect(s.sales.month.orders).toBe(1);
    expect(s.locked.carts).toBe(1);
    expect(s.locked.total.toFixed(2)).toBe("25000.00");
    expect(s.toBook).toBe(1);
    expect(s.count("OPEN")).toBe(1);
    expect(s.bestSellers).toEqual([
      { product: expect.objectContaining({ id: v.productId }), sold: 2 },
    ]);

    // The chart: 14 days, oldest first; today's bar holds the confirmed cart, the rest are 0.
    const days = await dailySales();
    expect(days).toHaveLength(14);
    expect(days[13].total.toFixed(2)).toBe("50000.00");
    expect(days[13].orders).toBe(1);
    expect(days.slice(0, 13).every((d) => d.orders === 0 && d.total.isZero())).toBe(true);
  });
});
