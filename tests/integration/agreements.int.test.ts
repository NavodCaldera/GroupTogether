import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { canSell, publishVersion, acceptLatest, acceptDisplayedVersion } from "@/server/agreements";
import {
  saveProduct,
  setProductHidden,
  listProducts,
  getProduct,
  suggestProducts,
  shopFacets,
} from "@/server/catalogue";
import { addStaff } from "@/server/factory-team";
import { createCart, setLine, sweep, acceptAndPay } from "@/server/carts/service";
import { makeUser, makeVariant, resetDb, cartRow } from "./helpers";
const now = new Date("2026-12-01T00:00:00Z");
const listing = {
  title: "Linen Shirt",
  brand: "Lanka Shirts",
  audience: "MEN",
  kind: "men-shirts",
  price: "25000",
};
const staff = {
  name: "Ruwan",
  email: "staff@example.lk",
  phone: "",
  role: "PACKING",
  password: "password123",
};
beforeEach(resetDb);
afterAll(() => db.$disconnect());
async function setup() {
  const core = await makeUser("ADMIN", "CORE");
  const factory = await db.user.update({
    where: { id: (await makeUser()).id },
    data: { role: "SELLER", company: "Lanka Shirts" },
  });
  await db.factoryProfile.create({ data: { factoryUserId: factory.id } });
  const version = await publishVersion(core.id, "Agreement v1");
  return { core, factory, version };
}
describe("factory agreements", () => {
  it("blocks listings and staff until acceptance, then records person/time/version", async () => {
    const { factory, version } = await setup();
    expect(await canSell(factory.id)).toBe(false);
    const variant = await makeVariant("25000", 1);
    await db.product.update({
      where: { id: variant.productId },
      data: { sellerId: factory.id, status: "ARCHIVED" },
    });
    await expect(setProductHidden(variant.productId, false)).rejects.toThrow(/agreement/i);
    await expect(saveProduct(null, listing, null, { sellerId: factory.id })).rejects.toThrow(
      /agreement/i,
    );
    await expect(addStaff(factory.id, staff)).rejects.toThrow(/agreement/i);
    await acceptLatest(factory.id, now);
    const acceptance = await db.agreementAcceptance.findFirstOrThrow();
    expect(acceptance).toMatchObject({
      factoryUserId: factory.id,
      acceptedById: factory.id,
      versionId: version.id,
      acceptedAt: now,
      endsAt: new Date("2027-12-01"),
    });
    expect(await canSell(factory.id, now)).toBe(true);
    expect((await saveProduct(null, listing, null, { sellerId: factory.id })).status).toBe("LIVE");
    expect(await addStaff(factory.id, staff)).toHaveProperty("id");
  });
  it("new version blocks listing and sales until reaccepted; old text is retained", async () => {
    const { core, factory, version } = await setup();
    await acceptLatest(factory.id, now);
    const product = await saveProduct(null, listing, null, { sellerId: factory.id });
    await db.variant.create({ data: { productId: product.id, size: "M", available: 5 } });
    const newer = await publishVersion(core.id, "Agreement v2");
    expect(newer.version).toBe(2);
    await expect(acceptDisplayedVersion(factory.id, version.id, now)).rejects.toThrow(/changed/i);
    expect((await db.agreementVersion.findUniqueOrThrow({ where: { id: version.id } })).text).toBe(
      "Agreement v1",
    );
    expect(await canSell(factory.id, now)).toBe(false);
    await expect(saveProduct(product.id, listing, null, { sellerId: factory.id })).rejects.toThrow(
      /agreement/i,
    );
    expect(await getProduct(product.id, now)).toBeNull();
    await acceptLatest(factory.id, now);
    expect(await canSell(factory.id, now)).toBe(true);
  });
  it("publishes only for CORE and serializes version numbers", async () => {
    const { core } = await setup();
    for (const area of ["FACTORY", "PREMIUM", "AGENTS"] as const)
      await expect(publishVersion((await makeUser("ADMIN", area)).id, "Changed")).rejects.toThrow();
    await expect(publishVersion(core.id, " ")).rejects.toThrow();
    const versions = await Promise.all([
      publishVersion(core.id, "Second"),
      publishVersion(core.id, "Third"),
    ]);
    expect(versions.map((v) => v.version).sort()).toEqual([2, 3]);
  });
  it("only the factory account accepts, and concurrent acceptance is duplicate-safe", async () => {
    const { factory } = await setup();
    const other = await makeUser();
    await expect(acceptLatest(other.id, now)).rejects.toThrow();
    await db.user.update({
      where: { id: other.id },
      data: { role: "SELLER", factoryId: factory.id, factoryRole: "OWNER" },
    });
    await expect(acceptLatest(other.id, now)).rejects.toThrow();
    await Promise.all([acceptLatest(factory.id, now), acceptLatest(factory.id, now)]);
    expect(await db.agreementAcceptance.count()).toBe(1);
  });
  it("expiry hides every shop path, refuses additions and keeps paid orders unchanged", async () => {
    const { factory } = await setup();
    await acceptLatest(factory.id, now);
    const v = await makeVariant("25000", 10);
    await db.product.update({
      where: { id: v.productId },
      data: { sellerId: factory.id, title: "Unique Shirt", brand: "OnlyFactory" },
    });
    const buyer = await makeUser();
    const paid = await createCart(buyer.id, {});
    await db.groupCart.update({
      where: { id: paid.id },
      data: { expiresAt: new Date("2028-01-01") },
    });
    await setLine(buyer.id, paid.id, v.id, 2, { now });
    await db.groupCart.update({
      where: { id: paid.id },
      data: { status: "CONFIRMED", confirmedAt: now },
    });
    const unpaidOwner = await makeUser();
    const unpaid = await createCart(unpaidOwner.id, {});
    await db.groupCart.update({
      where: { id: unpaid.id },
      data: { expiresAt: new Date("2028-01-01") },
    });
    await setLine(unpaidOwner.id, unpaid.id, v.id, 2, { now });
    const late = new Date("2027-12-02");
    await expect(
      acceptAndPay(
        unpaidOwner.id,
        unpaid.id,
        { deliveryAddress: "1 Factory Road", deliveryCity: "Colombo", deliveryPhone: "0771234567" },
        late,
      ),
    ).rejects.toThrow(/agreement/i);
    expect((await cartRow(unpaid.id)).status).toBe("READY");
    const before = await cartRow(paid.id);
    expect((await listProducts({}, 60, "newest", now)).map((p) => p.id)).toContain(v.productId);
    expect(await listProducts({}, 60, "newest", late)).toEqual([]);
    expect(await getProduct(v.productId, late)).toBeNull();
    expect(await suggestProducts("Unique", 6, late)).toEqual([]);
    expect((await shopFacets(late)).brands).not.toContain("OnlyFactory");
    const open = await createCart((await makeUser()).id, {});
    await db.groupCart.update({
      where: { id: open.id },
      data: { expiresAt: new Date("2028-01-01") },
    });
    await expect(setLine(open.ownerId, open.id, v.id, 1, { now: late })).rejects.toThrow(
      /agreement/i,
    );
    await sweep(late);
    expect(await cartRow(paid.id)).toEqual(before);
  });
  it("legacy grace ends until checks and current acceptance are both complete", async () => {
    const { factory } = await setup();
    const deadline = new Date("2026-12-31");
    await db.factoryProfile.update({
      where: { factoryUserId: factory.id },
      data: { complianceDueAt: deadline },
    });
    expect(await canSell(factory.id, now)).toBe(true);
    expect(await canSell(factory.id, deadline)).toBe(false);
    await acceptLatest(factory.id, now);
    expect(await canSell(factory.id, deadline)).toBe(false);
    await db.factoryApplication.create({
      data: {
        factoryUserId: factory.id,
        businessName: "Lanka Shirts",
        brNumber: "BR",
        ownerName: "Kamal",
        ownerNic: "NIC",
        phone: "0771234567",
        email: factory.email,
        address: "Factory",
        city: "Colombo",
        bankName: "BOC",
        bankBranch: "Colombo",
        accountName: "Kamal",
        accountNumber: "123",
        status: "APPROVED",
      },
    });
    expect(await canSell(factory.id, deadline)).toBe(true);
    await db.factoryProfile.update({
      where: { factoryUserId: factory.id },
      data: { status: "REMOVED" },
    });
    expect(await canSell(factory.id, now)).toBe(false);
  });
  it("retries a reminder claimed before a delivery failure without duplicating it", async () => {
    const { factory } = await setup();
    await acceptLatest(factory.id, now);
    const reminderAt = new Date("2027-11-01");
    await db.agreementAcceptance.updateMany({ data: { remindedAt: reminderAt } });
    await sweep(reminderAt);
    await sweep(reminderAt);
    expect(
      await db.notification.count({
        where: { userId: factory.id, title: "Factory agreement renewal" },
      }),
    ).toBe(1);
  });
  it("sweep sends the reminder once even concurrently, and renewal starts a new term", async () => {
    const { factory } = await setup();
    await acceptLatest(factory.id, now);
    const beforeReminder = new Date("2027-10-31");
    await sweep(beforeReminder);
    expect(await db.notification.count({ where: { title: "Factory agreement renewal" } })).toBe(0);
    const atReminder = new Date("2027-11-01");
    await Promise.all([sweep(atReminder), sweep(atReminder)]);
    await sweep(atReminder);
    expect(
      await db.notification.count({
        where: { userId: factory.id, title: "Factory agreement renewal" },
      }),
    ).toBe(1);
    expect((await db.agreementAcceptance.findFirstOrThrow()).remindedAt).toEqual(atReminder);
    await acceptLatest(factory.id, atReminder);
    expect(await db.agreementAcceptance.count()).toBe(2);
    expect(await canSell(factory.id, new Date("2028-10-31"))).toBe(true);
  });
});
