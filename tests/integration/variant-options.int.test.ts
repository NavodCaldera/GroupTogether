import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { adjustStock } from "@/server/catalogue";
import { setCartItem } from "@/server/orders/cart";
import { startCheckout } from "@/server/orders/checkout";
import { makeAgent, makeBuyer, makeFactory, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("PAYMENT_GATEWAY", "demo");
});
afterAll(() => db.$disconnect());

describe("variant options (DEC-029)", () => {
  it("stock writes set options, key and label, matching sizes regardless of case", async () => {
    const { factory, variant } = await makeFactory();
    await adjustStock(variant.productId, { size: "L", colour: " Navy " }, 4, {
      sellerId: factory.id,
    });
    const navy = await db.variant.findUniqueOrThrow({
      where: {
        productId_optionKey: { productId: variant.productId, optionKey: "colour=navy|size=l" },
      },
    });
    expect(navy).toMatchObject({
      options: { size: "L", colour: "Navy" },
      label: "L / Navy",
      available: 4,
    });
    await adjustStock(variant.productId, { size: "l", colour: "navy" }, 2, {
      sellerId: factory.id,
    });
    expect(await db.variant.count({ where: { productId: variant.productId } })).toBe(2);
    expect((await db.variant.findUniqueOrThrow({ where: { id: navy.id } })).available).toBe(6);
    await expect(
      adjustStock(variant.productId, { size: "M|L" }, 1, { sellerId: factory.id }),
    ).rejects.toThrow("can't contain");
  });

  it("every variant has a key, unique within its product", async () => {
    await makeFactory();
    await makeFactory();
    const rows = await db.variant.findMany({ select: { productId: true, optionKey: true } });
    expect(rows.every((r) => r.optionKey !== "")).toBe(true);
    const keys = rows.map((r) => `${r.productId}:${r.optionKey}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("checkout snapshots the variant label on the order line", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    const f = await makeFactory();
    await setCartItem(buyer.id, f.variant.id, 1);
    const r = await startCheckout(buyer.id, { agentId: agent.id, tokens: "0", requestKey: "vl1" });
    // Renaming the variant later does not change the receipt.
    await db.variant.update({ where: { id: f.variant.id }, data: { label: "Medium" } });
    const line = await db.orderLine.findFirstOrThrow({ where: { orderId: { in: r.orderIds } } });
    expect(line.variantLabel).toBe("M");
  });
});
