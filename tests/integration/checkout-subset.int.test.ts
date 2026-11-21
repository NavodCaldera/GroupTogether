import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { setCartItem } from "@/server/orders/cart";
import { quoteCheckout, startCheckout } from "@/server/orders/checkout";
import { makeAgent, makeBuyer, makeFactory, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("PAYMENT_GATEWAY", "demo");
});
afterAll(() => db.$disconnect());

const boughtVariants = async (orderIds: string[]) =>
  (await db.orderLine.findMany({ where: { orderId: { in: orderIds } } }))
    .map((l) => l.variantId)
    .sort();

describe("agent checkout of ticked items (spec 005)", () => {
  it("buys only the ticked items", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    const a = await makeFactory(),
      b = await makeFactory(),
      c = await makeFactory();
    for (const f of [a, b, c]) await setCartItem(buyer.id, f.variant.id, 1);
    const ticked = [a.variant.id, b.variant.id];
    const quote = await quoteCheckout(buyer.id, agent.id, "0", ticked);
    expect(quote.orders).toHaveLength(2);
    const r = await startCheckout(buyer.id, {
      agentId: agent.id,
      tokens: "0",
      requestKey: "sub1",
      variantIds: ticked,
    });
    expect(r.orderIds).toHaveLength(2);
    expect(await boughtVariants(r.orderIds)).toEqual([...ticked].sort());
    const left = await db.cartItem.findMany({ where: { buyerId: buyer.id } });
    expect(left.map((i) => i.variantId)).toEqual([c.variant.id]);
    expect((await db.variant.findUniqueOrThrow({ where: { id: c.variant.id } })).available).toBe(
      50,
    );
  });

  it("ignores ids not in the cart", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    const a = await makeFactory(),
      b = await makeFactory();
    await setCartItem(buyer.id, a.variant.id, 1);
    const r = await startCheckout(buyer.id, {
      agentId: agent.id,
      tokens: "0",
      requestKey: "sub2",
      variantIds: [a.variant.id, b.variant.id],
    });
    expect(await boughtVariants(r.orderIds)).toEqual([a.variant.id]);
    await setCartItem(buyer.id, a.variant.id, 1);
    await expect(
      startCheckout(buyer.id, {
        agentId: agent.id,
        tokens: "0",
        requestKey: "sub3",
        variantIds: [b.variant.id],
      }),
    ).rejects.toThrow("Your cart is empty");
    expect(await db.cartItem.count({ where: { buyerId: buyer.id } })).toBe(1);
  });
});
