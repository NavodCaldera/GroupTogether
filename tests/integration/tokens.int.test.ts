import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { D } from "@/lib/decimal";
import { db } from "@/server/db";
import {
  credit,
  applyTokens,
  tokenBalance,
  releaseLineTokens,
  spendCartTokens,
} from "@/server/tokens";
import { withCartTransaction } from "@/server/carts/locks";
import { createCart, setLine, markDone } from "@/server/carts/service";
import { makeUser, makeVariant, resetDb } from "./helpers";
beforeEach(resetDb);
afterAll(() => db.$disconnect());
export async function fund(userId: string, amount = "3000", ref = `fund:${userId}`) {
  await db.$transaction((tx) =>
    credit(tx, userId, new D(amount), "CANCELLATION", { cartLineId: ref }, "Test credit"),
  );
}
async function setup(amount = "3000") {
  const owner = await makeUser(),
    member = await makeUser();
  const cart = await createCart(owner.id, {}),
    variant = await makeVariant("1500", 10);
  await setLine(member.id, cart.id, variant.id, 1);
  const line = await db.cartLine.findFirstOrThrow({
    where: { cartId: cart.id, userId: member.id },
  });
  await fund(member.id, amount);
  return { owner, member, cart, variant, line };
}
describe("token ledger", () => {
  it("enforces balance, line value, ownership and amount precision", async () => {
    const { owner, member, line } = await setup("500");
    await expect(applyTokens(owner.id, line.id, "1")).rejects.toThrow();
    for (const amount of ["501", "0", "-1", "1.001", "1.000", "NaN", "Infinity"])
      await expect(applyTokens(member.id, line.id, amount)).rejects.toThrow();
    await fund(member.id, "2500", "extra-credit");
    await expect(applyTokens(member.id, line.id, "1500.01")).rejects.toThrow();
    await applyTokens(member.id, line.id, "1500");
    expect((await tokenBalance(member.id)).toFixed(2)).toBe("1500.00");
    expect(
      (await db.cartLine.findUniqueOrThrow({ where: { id: line.id } })).tokensApplied.toFixed(2),
    ).toBe("1500.00");
  });
  it("serializes two different carts spending the same 1500 balance", async () => {
    const { member, line, variant } = await setup("1500");
    const owner2 = await makeUser(),
      cart2 = await createCart(owner2.id, {});
    // Deliberately construct two memberships to exercise ledger isolation independently of the active-cart guard.
    await db.cartMember.create({ data: { cartId: cart2.id, userId: member.id } });
    const second = await db.cartLine.create({
      data: {
        cartId: cart2.id,
        userId: member.id,
        variantId: variant.id,
        qty: 1,
        unitPrice: "1500",
      },
    });
    await db.groupCart.update({ where: { id: cart2.id }, data: { total: "1500" } });
    const results = await Promise.allSettled([
      applyTokens(member.id, line.id, "1500"),
      applyTokens(member.id, second.id, "1500"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await tokenBalance(member.id)).toFixed(2)).toBe("0.00");
    expect(await db.tokenEntry.count({ where: { userId: member.id, kind: "HOLD" } })).toBe(1);
  });
  it("credits a business reference once under retries", async () => {
    const user = await makeUser();
    await Promise.all([fund(user.id, "3000"), fund(user.id, "3000")]);
    expect((await tokenBalance(user.id)).toFixed(2)).toBe("3000.00");
    expect(await db.tokenEntry.count({ where: { userId: user.id } })).toBe(1);
  });
  it("deduplicates a submitted hold request, then permits new holds after release", async () => {
    const { member, line, cart } = await setup();
    await Promise.all([
      applyTokens(member.id, line.id, "1500", "same-request"),
      applyTokens(member.id, line.id, "1500", "same-request"),
    ]);
    expect((await tokenBalance(member.id)).toFixed(2)).toBe("1500.00");
    await markDone(member.id, cart.id);
    const releases = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        withCartTransaction([cart.id], [member.id], (tx) => releaseLineTokens(tx, line.id)),
      ),
    );
    expect(releases.every((r) => r.status === "fulfilled")).toBe(true);
    expect(
      (
        await db.cartMember.findUniqueOrThrow({
          where: { cartId_userId: { cartId: cart.id, userId: member.id } },
        })
      ).doneAt,
    ).toBeNull();
    expect((await tokenBalance(member.id)).toFixed(2)).toBe("3000.00");
    expect(await db.tokenEntry.count({ where: { cartLineId: line.id, kind: "RELEASE" } })).toBe(1);
    await applyTokens(member.id, line.id, "1500");
    expect(await db.tokenEntry.count({ where: { cartLineId: line.id, kind: "HOLD" } })).toBe(2);
  });
  it("spends with one zero-delta marker, never refunds spent holds on retry", async () => {
    const { member, line, cart } = await setup();
    await applyTokens(member.id, line.id, "1500");
    await db.groupCart.update({ where: { id: cart.id }, data: { status: "SLIP_REVIEW" } });
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        withCartTransaction([cart.id], [], (tx) => spendCartTokens(tx, cart.id)),
      ),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await db.tokenEntry.count({ where: { cartLineId: line.id, kind: "SPEND" } })).toBe(1);
    expect((await tokenBalance(member.id)).toFixed(2)).toBe("1500.00");
    await withCartTransaction([cart.id], [], (tx) => releaseLineTokens(tx, line.id));
    expect((await tokenBalance(member.id)).toFixed(2)).toBe("1500.00");
  });
  it("refuses paid and expired carts and protects append-only entries", async () => {
    const { member, line, cart } = await setup();
    await db.groupCart.update({ where: { id: cart.id }, data: { status: "CONFIRMED" } });
    await expect(applyTokens(member.id, line.id, "1")).rejects.toThrow();
    await db.groupCart.update({
      where: { id: cart.id },
      data: { status: "OPEN", expiresAt: new Date(0) },
    });
    await expect(applyTokens(member.id, line.id, "1")).rejects.toThrow();
    const entry = await db.tokenEntry.findFirstOrThrow({ where: { userId: member.id } });
    await expect(
      db.tokenEntry.update({ where: { id: entry.id }, data: { note: "rewrite" } }),
    ).rejects.toThrow(/append.only/i);
    await expect(db.tokenEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/append.only/i);
  });
});
