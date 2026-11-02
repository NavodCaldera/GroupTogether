import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptAndPay, createCart, setLine, sweep } from "@/server/carts/service";
import { approveSlip, uploadSlip } from "@/server/carts/slips";
import { adjustStock, saveProduct } from "@/server/catalogue";
import { db } from "@/server/db";
import { saveLot } from "@/server/lots";
import { storeSnapshot } from "@/server/stock";
import { colomboIsoDay } from "@/lib/format";
import { makeUser, resetDb, slipFile } from "./helpers";

beforeEach(async () => {
  // The parked store flow (product owner, 2026-11-03).
  vi.stubEnv("FULFILMENT_MODE", "WAREHOUSE");
  await resetDb();
});
afterAll(() => db.$disconnect());

const DAY = 86_400_000;
const today = () => colomboIsoDay(new Date());

/** 6,000 pieces: 900,000 + 45,000 transport + 15,000 wages = LKR 160 a piece. */
const bulk = (receivedOn = today()) => ({
  name: "Ekala denim",
  pieces: "6000",
  bulkCost: "900,000",
  transportCost: "45000",
  wages: "15000",
  receivedOn,
});

async function lotProduct(lotId: string, stock = 10) {
  const p = await saveProduct(
    null,
    { title: "Denim dress", brand: "Factory", audience: "WOMEN", kind: "women-dresses", lotId },
    null,
  );
  await adjustStock(p.id, "M", "", stock);
  const v = await db.variant.findFirstOrThrow({ where: { productId: p.id } });
  return { product: p, variant: v };
}

const priceOf = async (id: string) =>
  (await db.product.findUniqueOrThrow({ where: { id } })).price.toString();

describe("bulk lots", () => {
  it("price their products at cost + 20%, then cost + 10% after 7 days", async () => {
    const lot = await saveLot(null, bulk());
    expect(lot).toMatchObject({ fullMarginPct: 20, reducedMarginPct: 10, reducedAt: null });
    expect(lot.reduceAt.getTime() - lot.receivedAt.getTime()).toBe(7 * DAY);

    const { product, variant } = await lotProduct(lot.id);
    expect(product.lotId).toBe(lot.id);
    expect(await priceOf(product.id)).toBe("192");

    // A buyer adds it at the full-margin price.
    const buyer = await makeUser();
    const cart = await createCart(buyer.id, {});
    await setLine(buyer.id, cart.id, variant.id, 2);

    // Day 8: the sweep drops the lot to 10% once.
    const later = new Date(lot.reduceAt.getTime() + 60_000);
    await sweep(later);
    expect(await priceOf(product.id)).toBe("176");
    const reduced = await db.lot.findUniqueOrThrow({ where: { id: lot.id } });
    expect(reduced.reducedAt).toEqual(later);
    await sweep(new Date(later.getTime() + DAY));
    expect((await db.lot.findUniqueOrThrow({ where: { id: lot.id } })).reducedAt).toEqual(later);

    // The cart line keeps the price it was added at.
    const line = await db.cartLine.findFirstOrThrow({ where: { cartId: cart.id } });
    expect(line.unitPrice.toString()).toBe("192");
  });

  it("is reduced at once when it arrived more than 7 days ago", async () => {
    const old = colomboIsoDay(new Date(Date.now() - 10 * DAY));
    const lot = await saveLot(null, bulk(old));
    expect(lot.reducedAt).not.toBeNull();
    const { product } = await lotProduct(lot.id);
    expect(await priceOf(product.id)).toBe("176");
  });

  it("reprices its products when its costs change, keeping its margins", async () => {
    const lot = await saveLot(null, bulk());
    const { product } = await lotProduct(lot.id);
    await db.settings.update({ where: { id: 1 }, data: { fullMarginPct: 50 } });
    await saveLot(lot.id, { ...bulk(), bulkCost: "1140000" });
    // (1,140,000 + 60,000) / 6,000 = 200 a piece, + the lot's own 20%.
    expect(await priceOf(product.id)).toBe("240");
  });

  it("uses the margins from Settings for new lots", async () => {
    await db.settings.update({
      where: { id: 1 },
      data: { fullMarginPct: 25, reducedMarginPct: 5, fullMarginDays: 3 },
    });
    const lot = await saveLot(null, bulk());
    expect(lot).toMatchObject({ fullMarginPct: 25, reducedMarginPct: 5 });
    expect(lot.reduceAt.getTime() - lot.receivedAt.getTime()).toBe(3 * DAY);
  });

  it("refuses a day in the future and needs a price without a lot", async () => {
    const tomorrow = colomboIsoDay(new Date(Date.now() + DAY));
    await expect(saveLot(null, bulk(tomorrow))).rejects.toThrow("Pick today or an earlier day");
    await expect(
      saveProduct(
        null,
        { title: "Loose shirt", brand: "X", audience: "MEN", kind: "men-shirts", price: "" },
        null,
      ),
    ).rejects.toThrow("Enter our price, or choose the lot it came from");
  });
});

describe("the store snapshot", () => {
  it("counts every piece still in the store and what each lot earned back", async () => {
    await db.settings.update({ where: { id: 1 }, data: { minOrderValue: "100" } });
    const lot = await saveLot(null, {
      ...bulk(),
      pieces: "50",
      bulkCost: "8000",
      transportCost: "",
      wages: "",
    });
    const { variant } = await lotProduct(lot.id, 20);

    // One cart paid but not handed over (2 pieces), one still open (3 pieces).
    const [owner, admin, other] = [await makeUser(), await makeUser("ADMIN"), await makeUser()];
    const paid = await createCart(owner.id, {});
    await setLine(owner.id, paid.id, variant.id, 2);
    await acceptAndPay(owner.id, paid.id, {
      deliveryAddress: "12 Flower Rd",
      deliveryCity: "Colombo",
      deliveryPhone: "0771234567",
    });
    await uploadSlip(owner.id, paid.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: paid.id } });
    await approveSlip(admin.id, slip.id);
    const open = await createCart(other.id, {});
    await setLine(other.id, open.id, variant.id, 3);

    const s = await storeSnapshot();
    expect(s.store).toMatchObject({
      capacity: 6000,
      free: 15,
      inCarts: 3,
      paidWaiting: 2,
      unlisted: 30,
      inStore: 50,
      room: 5950,
      averageAge: 0,
    });
    expect(s.store.bands[0].pieces).toBe(50);
    expect(s.lots[0]).toMatchObject({ listed: 20, sold: 2, inStore: 50, soldPct: 4 });
    expect(s.lots[0].costPerPiece.toString()).toBe("160");
    expect(s.lots[0].revenue.toString()).toBe("384");
    // 384 of 8,000 back.
    expect(s.lots[0].costBackPct).toBe(4);
  });
});
