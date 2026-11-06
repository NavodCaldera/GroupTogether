import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSeller } from "@/server/auth/service";
import { db } from "@/server/db";
import { createOffer, decideOffer } from "@/server/offers";
import { receiveStock, stockForPacker, stockToReceive } from "@/server/receiving";
import { makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

const seller = () =>
  createSeller({
    name: "Nuwan",
    company: "Ceylon Mills",
    email: `s-${Date.now()}@test.lk`,
    phone: "0761234567",
    password: "password123",
  });
const offer = { name: "Cotton shirts", description: "600 shirts", amount: "250000" };

describe("receiving sellers' stock", () => {
  it("an accepted offer waits under To receive until a packer presses Received", async () => {
    const [s, admin, packer] = [
      await seller(),
      await makeUser("ADMIN", "FACTORY"),
      await makeUser("PACKER"),
    ];
    const waiting = await createOffer(s.id, offer);
    const declined = await createOffer(s.id, { ...offer, name: "Belts" });
    expect(await stockToReceive()).toHaveLength(0);
    expect(await stockForPacker(waiting.id)).toBeNull();

    await decideOffer(waiting.id, true, "");
    await decideOffer(declined.id, false, "");
    const list = await stockToReceive();
    expect(list.map((o) => o.name)).toEqual(["Cotton shirts"]);
    expect(list[0]).not.toHaveProperty("amount");

    await receiveStock(packer.id, waiting.id);
    expect(await stockToReceive()).toHaveLength(0);
    expect(await db.stockOffer.findUniqueOrThrow({ where: { id: waiting.id } })).toMatchObject({
      receivedById: packer.id,
    });
    expect(
      await db.notification.count({ where: { userId: s.id, title: "We received your stock" } }),
    ).toBe(1);
    expect(
      await db.notification.count({ where: { userId: admin.id, title: "Stock received" } }),
    ).toBe(1);
    await expect(receiveStock(packer.id, waiting.id)).rejects.toThrow("already been received");
    await expect(receiveStock(packer.id, declined.id)).rejects.toThrow("already been received");
  });
});
