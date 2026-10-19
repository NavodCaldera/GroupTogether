import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSeller, homeFor } from "@/server/auth/service";
import { sendMessage } from "@/server/carts/chat";
import { createCart } from "@/server/carts/service";
import { db } from "@/server/db";
import { createOffer, decideOffer } from "@/server/offers";
import { publishProduct, returnToSeller } from "@/server/seller";
import { makeUser, resetDb } from "./helpers";

let n = 0;
beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

async function seller() {
  n++;
  return createSeller({
    name: "Nuwan",
    company: `Mill ${n}`,
    email: `seller${n}-${Date.now()}@test.lk`,
    phone: `076${String(1000000 + n).slice(-7)}`,
    password: "password123",
  });
}

const offer = { name: "Leather loafers", description: "600 pairs, sizes 6-11", amount: "250,000" };

describe("factory seller stock offers", () => {
  it("send → admins told → accept with a note → seller told", async () => {
    const [s, admin] = [await seller(), await makeUser("ADMIN")];
    expect(homeFor(s.role)).toBe("/seller");

    const o = await createOffer(s.id, offer);
    expect(o).toMatchObject({ status: "IN_REVIEW", name: "Leather loafers", sellerId: s.id });
    expect(o.amount.toString()).toBe("250000");
    expect(
      await db.notification.count({ where: { userId: admin.id, title: "Stock offer to review" } }),
    ).toBe(1);

    await decideOffer(o.id, true, "Deliver to our store on Monday");
    expect(await db.stockOffer.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      status: "ACCEPTED",
      note: "Deliver to our store on Monday",
    });
    expect(
      await db.notification.count({ where: { userId: s.id, title: "Your offer was accepted" } }),
    ).toBe(1);
    // Answered once only.
    await expect(decideOffer(o.id, false, "")).rejects.toThrow("already been answered");
  });

  it("declines without a note", async () => {
    const s = await seller();
    const o = await createOffer(s.id, offer);
    await decideOffer(o.id, false, "  ");
    expect(await db.stockOffer.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      status: "DECLINED",
      note: null,
    });
  });

  it("checks the three fields, and only sellers can send", async () => {
    const [s, buyer] = [await seller(), await makeUser()];
    await expect(createOffer(s.id, { ...offer, name: "" })).rejects.toThrow("product name");
    await expect(createOffer(s.id, { ...offer, description: "" })).rejects.toThrow("details");
    await expect(createOffer(s.id, { ...offer, amount: "0" })).rejects.toThrow("total price");
    await expect(createOffer(s.id, { ...offer, amount: "abc" })).rejects.toThrow("total price");
    await expect(createOffer(buyer.id, offer)).rejects.toThrow("Only factory sellers");
    expect(await db.stockOffer.count()).toBe(0);
  });

  it("sellers and packing staff can't use carts or message shoppers", async () => {
    const [s, packer, buyer] = [await seller(), await makeUser("PACKER"), await makeUser()];
    await expect(createCart(s.id, {})).rejects.toThrow("Only shoppers");
    await expect(createCart(packer.id, {})).rejects.toThrow("Only shoppers");
    const cart = await createCart(buyer.id, {});
    await expect(sendMessage(s.id, cart.id, "Hello")).rejects.toThrow("Only shoppers");
  });

  it("an admin can still publish or return a seller's product in review", async () => {
    const s = await seller();
    const make = () =>
      db.product.create({
        data: {
          title: "Loafer",
          brand: "Ceylon",
          category: "SHOES",
          audience: "MEN",
          kind: "men-formal",
          stockType: "FACTORY_SURPLUS",
          price: 6200,
          status: "IN_REVIEW",
          sellerId: s.id,
        },
      });
    const [a, b] = [await make(), await make()];
    await publishProduct(a.id);
    expect((await db.product.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("LIVE");
    await expect(publishProduct(a.id)).rejects.toThrow("isn't waiting for review");
    await returnToSeller(b.id, "Not this season");
    expect(await db.product.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({
      status: "DRAFT",
      reviewNote: "Not this season",
    });
  });

  it("refuses a second account with the same email", async () => {
    const s = await seller();
    await expect(
      createSeller({
        name: "Another person",
        company: "Y Mills",
        email: s.email,
        phone: "0769999999",
        password: "password123",
      }),
    ).rejects.toThrow("already exists");
  });
});
