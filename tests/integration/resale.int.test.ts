import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { publishPackVersion } from "@/server/company";
import { db } from "@/server/db";
import {
  browseListings,
  cancelListing,
  cancelReservation,
  completeReservation,
  createListing,
  expireReservations,
  getListing,
  purchase,
  reserve,
} from "@/server/resale";
import { makeBuyer, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const HOME = { lat: 6.9271, lng: 79.8612 };
const FAR = { lat: 6.8747, lng: 79.8605 }; // about 6 km south

/** A full Budget basket of 5 at LKR 1000 per family; the seller and four others paid. */
async function fullBasket(status: "FULL" | "OPEN" = "FULL") {
  const company = await db.company.create({ data: { slug: "co", name: "Co" } });
  const pack = await db.standardPack.create({
    data: { slug: "co-budget", name: "Budget Pack", durationDays: 30, companyId: company.id },
  });
  const v = await db.packVersion.create({
    data: {
      packId: pack.id,
      version: 1,
      publishedAt: new Date(),
      pricePerFamily: "1000.00",
      commissionPct: "10.00",
      items: {
        create: [
          { name: "Crackers", size: "490 g", qty: 2, retailPrice: "300.00", sortOrder: 0 },
          { name: "Biscuits", size: "400 g", qty: 1, retailPrice: "400.00", sortOrder: 1 },
          { name: "Milk", size: "1 l", qty: 1, retailPrice: "500.00", chilled: true, sortOrder: 2 },
        ],
      },
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  const seller = await makeBuyer(HOME);
  const g = await db.packGroup.create({
    data: {
      versionId: v.id,
      size: 5,
      price: "1000.00",
      createdById: seller.id,
      ...HOME,
      address: "1 Test Rd",
      city: "Colombo 3",
      status,
      joined: 1,
      closesAt: new Date(Date.now() + 86_400_000),
      members: { create: { userId: seller.id, status: "PAID", paidAt: new Date() } },
    },
  });
  const [crackers, biscuits, milk] = v.items;
  return { company, pack, g, seller, crackers, biscuits, milk };
}

const listing = (
  groupId: string,
  itemId: string,
  extra: Partial<{ qty: number; audience: string }> = {},
) => ({
  groupId,
  itemId,
  qty: 1,
  audience: "BOTH",
  spot: "Station entrance",
  unopened: true,
  ...extra,
});

/** Both users save each other's number. */
async function mutual(
  a: { id: string; phone: string | null },
  b: { id: string; phone: string | null },
) {
  await db.userContact.createMany({
    data: [
      { userId: a.id, phone: b.phone! },
      { userId: b.id, phone: a.phone! },
    ],
  });
}

describe("purchase history", () => {
  it("shows the items as bought even after the company publishes a new version", async () => {
    const { company, pack, g, seller } = await fullBasket();
    await publishPackVersion(
      company.id,
      pack.id,
      "2000.00",
      { discount5: "0", discount10: "0", discount15: "0" },
      [{ name: "Something new", size: "1 kg", qty: 3, retailPrice: "", photo: null, file: null }],
    );
    const p = (await purchase(seller.id, g.id))!;
    expect(p.items.map((i) => i.name)).toEqual(["Crackers", "Biscuits", "Milk"]);
    // 1000 split by shop value 600 : 400 : 500 → 400.00, 266.67, 333.33; crackers are 2 units.
    expect(p.items.map((i) => i.unitPrice?.toFixed(2))).toEqual(["200.00", "266.67", "333.33"]);
    expect(p.items.map((i) => i.resellable)).toEqual([true, true, false]);
  });

  it("shows no price and allows no resale when an item has no shop price", async () => {
    const { g, seller, biscuits } = await fullBasket();
    await db.packItem.update({ where: { id: biscuits.id }, data: { retailPrice: null } });
    const p = (await purchase(seller.id, g.id))!;
    expect(p.items.every((i) => i.unitPrice === null && !i.resellable)).toBe(true);
    await expect(createListing(seller.id, listing(g.id, biscuits.id))).rejects.toThrow(
      "Original item price unavailable",
    );
  });

  it("is someone else's basket: nothing to show", async () => {
    const { g } = await fullBasket();
    const other = await makeBuyer(HOME);
    expect(await purchase(other.id, g.id)).toBeNull();
  });
});

describe("listing", () => {
  it("lists at the locked unit price, whatever the form sends", async () => {
    const { g, seller, crackers } = await fullBasket();
    const { id } = await createListing(seller.id, {
      ...listing(g.id, crackers.id),
      unitPrice: "999.00",
    } as never);
    const l = await db.resaleListing.findUniqueOrThrow({ where: { id } });
    expect(l.unitPrice.toFixed(2)).toBe("200.00");
  });

  it("refuses others' items, more than bought, a second listing of the same units, and chilled goods", async () => {
    const { g, seller, crackers, milk } = await fullBasket();
    const other = await makeBuyer(HOME);
    await expect(createListing(other.id, listing(g.id, crackers.id))).rejects.toThrow(
      "own paid baskets",
    );
    await expect(createListing(seller.id, listing(g.id, crackers.id, { qty: 3 }))).rejects.toThrow(
      "You have 2 left",
    );
    await createListing(seller.id, listing(g.id, crackers.id, { qty: 2 }));
    await expect(createListing(seller.id, listing(g.id, crackers.id))).rejects.toThrow(
      "All of these are listed",
    );
    await expect(createListing(seller.id, listing(g.id, milk.id))).rejects.toThrow("Chilled");
  });

  it("needs the basket ordered and the unopened box ticked", async () => {
    const open = await fullBasket("OPEN");
    await expect(
      createListing(open.seller.id, listing(open.g.id, open.crackers.id)),
    ).rejects.toThrow("full and ordered");
    await expect(
      createListing(open.seller.id, { ...listing(open.g.id, open.crackers.id), unopened: false }),
    ).rejects.toThrow("unopened");
  });

  it("never lists more than bought, even when two listings race", async () => {
    const { g, seller, crackers } = await fullBasket();
    const r = await Promise.allSettled([
      createListing(seller.id, listing(g.id, crackers.id, { qty: 2 })),
      createListing(seller.id, listing(g.id, crackers.id, { qty: 2 })),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const sum = await db.resaleListing.aggregate({ _sum: { qty: true } });
    expect(sum._sum.qty).toBe(2);
  });
});

describe("who sees a listing", () => {
  it("contacts-only reaches a mutual contact far away, not a nearby stranger, even by URL", async () => {
    const { g, seller, crackers } = await fullBasket();
    const friend = await makeBuyer(FAR);
    const neighbour = await makeBuyer(HOME);
    const oneWay = await makeBuyer(FAR);
    await mutual(seller, friend);
    await db.userContact.create({ data: { userId: oneWay.id, phone: seller.phone! } });
    const { id } = await createListing(
      seller.id,
      listing(g.id, crackers.id, { audience: "CONTACTS" }),
    );

    expect((await browseListings(friend, "contacts"))!.map((l) => l.id)).toEqual([id]);
    expect(await getListing(id, friend)).not.toBeNull();
    expect(await browseListings(neighbour, "nearby")).toEqual([]);
    expect(await getListing(id, neighbour)).toBeNull();
    expect(await getListing(id, oneWay)).toBeNull();
    await expect(reserve(neighbour.id, id, 1)).rejects.toThrow("not available to you");
  });

  it("nearby reaches a buyer within 1 km but not a contact far away", async () => {
    const { g, seller, crackers } = await fullBasket();
    const friend = await makeBuyer(FAR);
    const neighbour = await makeBuyer({ lat: HOME.lat + 0.005, lng: HOME.lng });
    await mutual(seller, friend);
    const { id } = await createListing(
      seller.id,
      listing(g.id, crackers.id, { audience: "NEARBY" }),
    );

    const near = (await browseListings(neighbour, "nearby"))!;
    expect(near.map((l) => [l.id, l.city, l.available])).toEqual([[id, "Colombo 3", 1]]);
    expect(await browseListings(friend, "contacts")).toEqual([]);
    expect(await getListing(id, friend)).toBeNull();
  });

  it("hides the pickup spot until the viewer reserves", async () => {
    const { g, seller, crackers } = await fullBasket();
    const buyer = await makeBuyer(HOME);
    const { id } = await createListing(seller.id, listing(g.id, crackers.id));
    expect((await getListing(id, buyer))!.spot).toBeNull();
    await reserve(buyer.id, id, 1);
    expect((await getListing(id, buyer))!.spot).toBe("Station entrance");
  });
});

describe("reservations", () => {
  it("gives the last unit to one of two buyers reserving at once", async () => {
    const { g, seller, biscuits } = await fullBasket();
    const a = await makeBuyer(HOME);
    const b = await makeBuyer(HOME);
    const { id } = await createListing(seller.id, listing(g.id, biscuits.id));
    const r = await Promise.allSettled([reserve(a.id, id, 1), reserve(b.id, id, 1)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.resaleReservation.count()).toBe(1);
  });

  it("refuses the seller's own listing", async () => {
    const { g, seller, crackers } = await fullBasket();
    const { id } = await createListing(seller.id, listing(g.id, crackers.id));
    await expect(reserve(seller.id, id, 1)).rejects.toThrow("your own listing");
  });

  it("frees units on cancel and on expiry, but not after a completed handover", async () => {
    const { g, seller, crackers } = await fullBasket();
    const buyer = await makeBuyer(HOME);
    const { id } = await createListing(seller.id, listing(g.id, crackers.id, { qty: 2 }));
    const free = async () => (await getListing(id, buyer))!.available;

    const r1 = await reserve(buyer.id, id, 2);
    expect(await free()).toBe(0);
    await cancelReservation(seller.id, r1.id);
    expect(await free()).toBe(2);

    const r2 = await reserve(buyer.id, id, 1);
    await db.resaleReservation.update({
      where: { id: r2.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await free()).toBe(2);
    expect(await expireReservations(new Date())).toBe(1);
    await expect(completeReservation(seller.id, r2.id)).rejects.toThrow("no longer open");

    const r3 = await reserve(buyer.id, id, 1);
    await completeReservation(seller.id, r3.id);
    expect(await free()).toBe(1);
    await expect(cancelReservation(buyer.id, r3.id)).rejects.toThrow("no longer open");

    await cancelListing(seller.id, id);
    const l = await db.resaleListing.findUniqueOrThrow({ where: { id } });
    expect([l.qty, !!l.cancelledAt]).toEqual([1, true]);
    // The cancelled unit can be listed again; the handed-over one cannot.
    await createListing(seller.id, listing(g.id, crackers.id));
    await expect(createListing(seller.id, listing(g.id, crackers.id))).rejects.toThrow(
      "All of these are listed",
    );
  });

  it("lets only the buyer or seller cancel, and only the seller complete", async () => {
    const { g, seller, crackers } = await fullBasket();
    const buyer = await makeBuyer(HOME);
    const stranger = await makeBuyer(HOME);
    const { id } = await createListing(seller.id, listing(g.id, crackers.id));
    const r = await reserve(buyer.id, id, 1);
    await expect(cancelReservation(stranger.id, r.id)).rejects.toThrow("not found");
    await expect(completeReservation(buyer.id, r.id)).rejects.toThrow("not found");
  });
});
