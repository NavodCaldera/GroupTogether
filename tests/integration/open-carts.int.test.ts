import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createCart } from "@/server/carts/service";
import { recentCarts } from "@/server/carts/queries";
import { db } from "@/server/db";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const colombo = { lat: 6.9271, lng: 79.8612 };
const galle = { lat: 7.0917, lng: 79.9999 }; // Gampaha, about 25 km from Colombo
const kandy = { lat: 7.2906, lng: 80.6337 };

async function ownerAt(pin: { lat: number; lng: number } | null, name: string) {
  const u = await makeUser();
  // makeUser pins everyone in Colombo; an unknown pin is cleared explicitly.
  await db.user.update({ where: { id: u.id }, data: pin ?? { lat: null, lng: null } });
  return createCart(u.id, { name });
}

describe("open carts panel", () => {
  it("lists the nearest delivery point first, unknown pins last", async () => {
    await ownerAt(kandy, "Kandy cart");
    await ownerAt(null, "No pin cart");
    await ownerAt(galle, "Galle cart");
    const buyer = await makeUser();
    const carts = await recentCarts(10, new Date(), buyer.id, { near: colombo });
    expect(carts.map((c) => c.name)).toEqual(["Galle cart", "Kandy cart", "No pin cart"]);
    expect(carts[0].distanceKm).toBeGreaterThan(15);
    expect(carts[0].distanceKm).toBeLessThan(40);
    expect(carts[2].distanceKm).toBeNull();
  });

  it("falls back to newest first without a location, and searches by name", async () => {
    await ownerAt(kandy, "Office clothing run");
    await ownerAt(galle, "Family school shirts");
    const buyer = await makeUser();
    expect((await recentCarts(10, new Date(), buyer.id)).map((c) => c.name)).toEqual([
      "Family school shirts",
      "Office clothing run",
    ]);
    const found = await recentCarts(10, new Date(), buyer.id, { q: "CLOTHING", near: colombo });
    expect(found.map((c) => c.name)).toEqual(["Office clothing run"]);
  });
});
