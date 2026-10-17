import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  acceptMerge,
  cancelMerge,
  CartError,
  createCart,
  declineMerge,
  requestMerge,
  setLine,
} from "@/server/carts/service";
import { db } from "@/server/db";
import { cartRow, makeUser, makeVariant, resetDb, variantRow } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

/** `a` has a cart with items; `b` owns the cart `a` wants to join. */
async function setup() {
  const [a, b] = [await makeUser(), await makeUser()];
  const v = await makeVariant("1000", 20);
  const mine = await createCart(a.id, { name: "Mine" });
  await setLine(a.id, mine.id, v.id, 3, { add: true });
  const theirs = await createCart(b.id, { name: "Theirs" });
  await setLine(b.id, theirs.id, v.id, 2, { add: true });
  return { a, b, v, mine, theirs };
}

describe("merging into a friend's cart", () => {
  it("moves the items and deletes the old cart once the owner accepts", async () => {
    const { a, b, v, mine, theirs } = await setup();
    const req = await requestMerge(a.id, theirs.id);
    // Nothing changes until the owner accepts.
    expect(await db.cartLine.count({ where: { cartId: mine.id } })).toBe(1);
    expect(
      await db.notification.count({
        where: { userId: b.id, title: { contains: "wants to join" } },
      }),
    ).toBe(1);

    await acceptMerge(b.id, req.id);
    expect(await db.groupCart.findUnique({ where: { id: mine.id } })).toBeNull();
    const lines = await db.cartLine.findMany({ where: { cartId: theirs.id, userId: a.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(3);
    expect(await db.cartMember.count({ where: { cartId: theirs.id } })).toBe(2);
    expect((await cartRow(theirs.id)).total.toString()).toBe("5000");
    // Stock stayed locked the whole time: 20 - 3 - 2.
    expect(await variantRow(v.id)).toMatchObject({ available: 15, reserved: 5 });
    expect((await db.cartMergeRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe(
      "ACCEPTED",
    );
    // And they can keep adding to the new cart.
    await setLine(a.id, theirs.id, v.id, 1, { add: true });
  });

  it("changes nothing when the owner declines or the buyer cancels", async () => {
    const { a, b, mine, theirs } = await setup();
    const r1 = await requestMerge(a.id, theirs.id);
    await expect(requestMerge(a.id, theirs.id)).rejects.toThrow(/already have a request/);
    await declineMerge(b.id, r1.id);
    expect(await db.groupCart.findUnique({ where: { id: mine.id } })).not.toBeNull();
    const r2 = await requestMerge(a.id, theirs.id);
    await cancelMerge(a.id, r2.id);
    await expect(acceptMerge(b.id, r2.id)).rejects.toThrow(CartError);
  });

  it("only the target cart's owner can accept, and not for a cart with other members", async () => {
    const { a, b, mine, theirs } = await setup();
    const c = await makeUser();
    const req = await requestMerge(a.id, theirs.id);
    await expect(acceptMerge(c.id, req.id)).rejects.toThrow(/Only the cart owner/);
    // Someone joins A's cart before the owner decides: it can no longer be merged.
    await setLine(c.id, mine.id, (await makeVariant("500", 5)).id, 1, { add: true });
    await expect(acceptMerge(b.id, req.id)).rejects.toThrow(/other members/);
    expect(await db.groupCart.findUnique({ where: { id: mine.id } })).not.toBeNull();
  });

  it("lets a plain member move out of someone else's cart", async () => {
    const { a, b, theirs } = await setup();
    const c = await makeUser();
    const v2 = await makeVariant("700", 10);
    const cs = await createCart(c.id, { name: "C's" });
    await db.cartMember.create({ data: { cartId: cs.id, userId: a.id } });
    await db.cartLine.deleteMany({ where: { userId: a.id } }); // a's earlier cart lines are not under test
    await db.groupCart.deleteMany({ where: { ownerId: a.id } });
    await setLine(a.id, cs.id, v2.id, 2, { add: true });
    const req = await requestMerge(a.id, theirs.id);
    await acceptMerge(b.id, req.id);
    expect(await db.groupCart.findUnique({ where: { id: cs.id } })).not.toBeNull();
    expect(await db.cartMember.count({ where: { cartId: cs.id, userId: a.id } })).toBe(0);
    expect(await db.cartLine.count({ where: { cartId: theirs.id, userId: a.id } })).toBe(1);
  });
});
