import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { setCartItem } from "@/server/orders/cart";
import { startCheckout } from "@/server/orders/checkout";
import { expireOrders } from "@/server/orders/baskets";
import { buyerOrder, buyerOrders } from "@/server/orders/buyer";
import { fundTokens, makeAgent, makeBuyer, makeFactory, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("PAYMENT_GATEWAY", "demo");
  vi.stubEnv("DEMO_MERCHANT_ID", "1200000");
  vi.stubEnv("DEMO_MERCHANT_SECRET", "test-secret");
});
afterAll(() => db.$disconnect());

describe("buyer orders list (DEC-026)", () => {
  it("hides never-paid", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const buyer = await makeBuyer();
    // Paid in full with tokens: PAID at once.
    await fundTokens(buyer.id, "1155");
    await setCartItem(buyer.id, f.variant.id, 1);
    const paid = await startCheckout(buyer.id, {
      agentId: agent.id,
      tokens: "1155",
      requestKey: "a",
    });
    // Left unpaid, then its hold lapses.
    await setCartItem(buyer.id, f.variant.id, 1);
    const unpaid = await startCheckout(buyer.id, {
      agentId: agent.id,
      tokens: "0",
      requestKey: "b",
    });
    expect(await expireOrders(new Date(Date.now() + 60 * 60_000))).toBe(1);

    const { orders } = await buyerOrders(buyer.id);
    expect(orders.map((o) => o.id)).toEqual([paid.orderIds[0]]);
    expect(orders.map((o) => o.id)).not.toContain(unpaid.orderIds[0]);
  });

  it("shows the pickup code only on an order still waiting at the agent", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const buyer = await makeBuyer();
    const order = async (key: string) => {
      await fundTokens(buyer.id, "1155");
      await setCartItem(buyer.id, f.variant.id, 1);
      return (await startCheckout(buyer.id, { agentId: agent.id, tokens: "1155", requestKey: key }))
        .orderIds[0]!;
    };
    const collected = await order("c");
    const waiting = await order("w");
    const now = new Date();
    await db.order.updateMany({
      where: { id: { in: [collected, waiting] } },
      data: { status: "RECEIVED", receivedAt: now },
    });
    await db.orderLine.updateMany({ where: { orderId: collected }, data: { collectedAt: now } });
    await db.pickupCode.create({ data: { buyerId: buyer.id, agentId: agent.id, code: "135790" } });
    expect((await buyerOrder(buyer.id, collected))?.pickup).toBeNull();
    expect((await buyerOrder(buyer.id, waiting))?.pickup?.code).toBe("135790");
  });

  it("exports no cancel", async () => {
    const actions = await import("@/app/orders/[id]/actions");
    expect("cancelOrderAction" in actions).toBe(false);
    const baskets = await import("@/server/orders/baskets");
    expect("cancelOrder" in baskets).toBe(false);
  });
});
