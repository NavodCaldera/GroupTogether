import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { setCommission } from "@/server/settings";
import { saveProduct } from "@/server/catalogue";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());
const listing = {
  title: "Commission shirt",
  brand: "Factory",
  audience: "MEN",
  kind: "men-shirts",
  price: "1400",
};
async function setup() {
  const core = await makeUser("ADMIN", "CORE");
  const factory = await db.user.update({
    where: { id: (await makeUser()).id },
    data: { role: "SELLER" },
  });
  await db.factoryProfile.create({
    data: { factoryUserId: factory.id, complianceDueAt: new Date("2099-01-01") },
  });
  return { core, factory };
}
describe("commission snapshots", () => {
  it("uses 100 then 120 only on new factory listings and retains the old snapshot on edits", async () => {
    const { core, factory } = await setup();
    const first = await saveProduct(null, listing, null, { sellerId: factory.id });
    expect(first.price.toFixed(2)).toBe("1500.00");
    expect(first.factoryPrice?.toFixed(2)).toBe("1400.00");
    expect(first.commission?.toFixed(2)).toBe("100.00");
    await setCommission(core.id, "120");
    expect((await db.product.findUniqueOrThrow({ where: { id: first.id } })).price.toFixed(2)).toBe(
      "1500.00",
    );
    const second = await saveProduct(null, listing, null, { sellerId: factory.id });
    expect(second.price.toFixed(2)).toBe("1520.00");
    const edited = await saveProduct(first.id, { ...listing, price: "2000" }, null, {
      sellerId: factory.id,
    });
    expect(edited.price.toFixed(2)).toBe("2100.00");
    expect(edited.commission?.toFixed(2)).toBe("100.00");
  });
  it("enforces CORE-only changes and validates zero/precision", async () => {
    const { core, factory } = await setup();
    for (const actor of [
      factory,
      await makeUser("ADMIN", "FACTORY"),
      await makeUser("ADMIN", "PREMIUM"),
      await makeUser(),
    ])
      await expect(setCommission(actor.id, "120")).rejects.toThrow();
    for (const amount of ["-1", "1.001"])
      await expect(setCommission(core.id, amount)).rejects.toThrow();
    await setCommission(core.id, "0");
    expect(
      (await saveProduct(null, listing, null, { sellerId: factory.id })).price.toFixed(2),
    ).toBe("1400.00");
  });
  it("leaves GroupBasket own pricing unchanged", async () => {
    const product = await saveProduct(null, listing, null);
    expect(product.price.toFixed(2)).toBe("1400.00");
    expect(product.commission).toBeNull();
    expect(product.factoryPrice).toBeNull();
  });
  it("keeps old prices and consistent snapshots during a concurrent setting change", async () => {
    const { core, factory } = await setup();
    const old = await saveProduct(null, listing, null, { sellerId: factory.id });
    const [created] = await Promise.all([
      saveProduct(null, listing, null, { sellerId: factory.id }),
      setCommission(core.id, "120"),
    ]);
    expect(["100.00", "120.00"]).toContain(created.commission!.toFixed(2));
    expect(created.price.minus(created.commission!).toFixed(2)).toBe("1400.00");
    expect((await db.product.findUniqueOrThrow({ where: { id: old.id } })).price.toFixed(2)).toBe(
      "1500.00",
    );
    expect(
      (await saveProduct(null, listing, null, { sellerId: factory.id })).price.toFixed(2),
    ).toBe("1520.00");
  });
});
