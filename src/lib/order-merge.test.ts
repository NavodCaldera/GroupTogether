import { describe, expect, it } from "vitest";
import { oneCardPerBasket } from "./order-merge";

const order = (
  id: string,
  day: number,
  basket: { id: string; kind: string } | null,
  due: string,
) => ({
  id,
  status: "PAID",
  paidAt: new Date(2026, 10, day),
  createdAt: new Date(2026, 10, day),
  tokensApplied: "0",
  amountDue: due,
  lines: [{ id: `l-${id}` }],
  basket: basket && { ...basket, status: "OPEN" },
});

describe("oneCardPerBasket", () => {
  it("joins a buyer's payments into one own basket, newest order first, summed, first date", () => {
    const own = { id: "b1", kind: "OWN" };
    const out = oneCardPerBasket([order("o2", 21, own, "10.50"), order("o1", 19, own, "5.25")]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("o2");
    expect(out[0]!.lines.map((l) => l.id)).toEqual(["l-o2", "l-o1"]);
    expect(String(out[0]!.amountDue)).toBe("15.75");
    expect(out[0]!.createdAt.getDate()).toBe(19);
  });

  it("leaves agent orders and different baskets apart", () => {
    const out = oneCardPerBasket([
      order("a", 21, { id: "x", kind: "AGENT" }, "1"),
      order("b", 20, { id: "x", kind: "AGENT" }, "1"),
      order("c", 20, { id: "o1", kind: "OWN" }, "1"),
      order("d", 19, { id: "o2", kind: "OWN" }, "1"),
    ]);
    expect(out.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps a refunded payment apart from a paid one in the same basket", () => {
    const own = { id: "b1", kind: "OWN" };
    const refunded = { ...order("o1", 19, own, "1"), status: "CANCELLED" };
    expect(oneCardPerBasket([order("o2", 21, own, "1"), refunded])).toHaveLength(2);
  });
});
