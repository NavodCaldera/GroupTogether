import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const principal = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => principal.user }));
import { GET } from "@/app/api/return-photos/[id]/route";
import { db } from "@/server/db";
import {
  fileReturn,
  factoryDecide,
  adminDecide,
  markReceived,
  escalateOverdue,
  bookReturnPickup,
  returnPhotoFor,
  postReturnMessage,
  listReturnMessages,
  adminReturn,
  adminReturns,
} from "@/server/returns";
import { removeFactory } from "@/server/quality";
import { makeUser, makeVariant, resetDb, giftPhotoFile } from "./helpers";
beforeEach(resetDb);
afterAll(() => db.$disconnect());
const deliveredAt = new Date("2026-11-01T10:00:00Z");
const now = new Date("2026-11-02T10:00:00Z");
const input = (qty = 1, fault: "FACTORY" | "BUYER" = "FACTORY") => ({
  qty,
  fault,
  reason: "DAMAGED" as const,
  note: "Loose sleeve seam",
  photos: fault === "FACTORY" ? [giftPhotoFile()] : [],
});
async function fixture(qty = 1) {
  const buyer = await makeUser(),
    other = await makeUser(),
    admin = await makeUser("ADMIN", "FACTORY");
  const factory = await db.user.create({
    data: {
      name: "Lanka Shirts",
      email: `factory-${buyer.id}@test.lk`,
      role: "SELLER",
      passwordHash: "x",
      factoryProfile: { create: {} },
    },
  });
  const sales = await db.user.create({
    data: {
      name: "Sales",
      email: `sales-${buyer.id}@test.lk`,
      role: "SELLER",
      passwordHash: "x",
      factoryId: factory.id,
      factoryRole: "SALES",
    },
  });
  const v = await makeVariant("1500", 5);
  await db.product.update({
    where: { id: v.productId },
    data: { sellerId: factory.id, category: "APPAREL", title: "Lanka Shirts shirt" },
  });
  const cart = await db.groupCart.create({
    data: {
      code: buyer.id.slice(-8),
      ownerId: buyer.id,
      status: "DELIVERED",
      total: "4500",
      minOrderValue: "1500",
      expiresAt: now,
      members: { create: [{ userId: buyer.id }, { userId: other.id }] },
      delivery: { create: { provider: "manual", status: "DELIVERED", deliveredAt } },
    },
  });
  const line = await db.cartLine.create({
    data: { cartId: cart.id, userId: buyer.id, variantId: v.id, qty, unitPrice: "1500" },
  });
  return { buyer, other, factory, sales, admin, cart, line };
}
const row = (id: string) => db.returnRequest.findUniqueOrThrow({ where: { id } });
const credits = (id: string) => db.tokenEntry.findMany({ where: { returnId: id, kind: "RETURN" } });
describe("returns", () => {
  it("files with a 24h factory deadline", async () => {
    const f = await fixture();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    expect(r.factoryDueAt.getTime() - r.createdAt.getTime()).toBe(24 * 3600000);
  });
  it("escalates 24h plus 1 minute but not 23h59m", async () => {
    const f = await fixture();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    expect(await escalateOverdue(new Date(now.getTime() + 24 * 3600000 - 60000))).toBe(0);
    expect((await row(r.id)).status).toBe("WAITING_FACTORY");
    expect(await escalateOverdue(new Date(now.getTime() + 24 * 3600000 + 60000))).toBe(1);
    expect((await row(r.id)).status).toBe("WITH_ADMIN");
  });
  it("keeps a stored 48h due time", async () => {
    const f = await fixture();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await db.returnRequest.update({
      where: { id: r.id },
      data: { factoryDueAt: new Date(now.getTime() + 48 * 3600000) },
    });
    expect(await escalateOverdue(new Date(now.getTime() + 25 * 3600000))).toBe(0);
    expect((await row(r.id)).status).toBe("WAITING_FACTORY");
  });
  it("factoryDecide is refused after the stored due time", async () => {
    const f = await fixture();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await db.returnRequest.update({ where: { id: r.id }, data: { factoryDueAt: now } });
    await expect(
      factoryDecide(f.factory.id, r.id, true, new Date(now.getTime() + 1)),
    ).rejects.toThrow("This return has already been decided");
  });
  it("notifies FACTORY and CORE admins at filing and permits view-only admin access", async () => {
    const f = await fixture();
    const core = await makeUser("ADMIN", "CORE"),
      premium = await makeUser("ADMIN", "PREMIUM"),
      warehouse = await makeUser("ADMIN");
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    for (const id of [f.admin.id, core.id]) {
      expect(
        await db.notification.count({ where: { userId: id, title: "Return requested" } }),
      ).toBe(1);
      expect(await adminReturn(id, r.id)).toMatchObject({ id: r.id, status: "WAITING_FACTORY" });
      expect((await adminReturns(id)).map((x) => x.id)).toContain(r.id);
      await expect(adminDecide(id, r.id, true, "Review")).rejects.toThrow(
        "This return has already been decided",
      );
    }
    for (const id of [premium.id, warehouse.id])
      expect(
        await db.notification.count({ where: { userId: id, title: "Return requested" } }),
      ).toBe(0);
  });
  it("requires a factory refusal reason and automatically notifies admins", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await expect(factoryDecide(f.sales.id, r.id, false, now)).rejects.toThrow(/reason/i);
    await expect(factoryDecide(f.sales.id, r.id, false, now, "x".repeat(1001))).rejects.toThrow(
      /reason/i,
    );
    await factoryDecide(f.sales.id, r.id, false, now, "Please review the seam");
    expect(await row(r.id)).toMatchObject({
      status: "WITH_ADMIN",
      factoryNote: "Please review the seam",
    });
    expect(
      await db.notification.count({ where: { userId: f.admin.id, title: "Return needs review" } }),
    ).toBe(1);
    expect(await credits(r.id)).toHaveLength(0);
  });
  it.each([true, false])(
    "automatically reviews a used buyer-fault receipt; admin accepts=%s",
    async (accept) => {
      const f = await fixture(2),
        r = await fileReturn(f.buyer.id, f.line.id, input(2, "BUYER"), now);
      await factoryDecide(f.factory.id, r.id, true, now);
      await markReceived(f.sales.id, r.id, false, "Tags removed");
      expect(await row(r.id)).toMatchObject({
        status: "WITH_ADMIN",
        receivedCondition: "Tags removed",
        adminDecision: null,
      });
      expect(await credits(r.id)).toHaveLength(0);
      await adminDecide(f.admin.id, r.id, accept, "Condition reviewed");
      expect((await row(r.id)).status).toBe(accept ? "COMPLETED" : "REJECTED");
      expect((await credits(r.id)).map((e) => e.amount.toFixed(2))).toEqual(
        accept ? ["3000.00"] : [],
      );
      await expect(adminDecide(f.admin.id, r.id, true, "Again")).rejects.toThrow(/already/);
      await expect(markReceived(f.factory.id, r.id, true)).rejects.toThrow();
    },
  );
  async function adminAcceptedBuyerReturn() {
    const f = await fixture(2),
      r = await fileReturn(f.buyer.id, f.line.id, input(2, "BUYER"), now);
    await factoryDecide(f.factory.id, r.id, false, now, "Review needed");
    await adminDecide(f.admin.id, r.id, true, "Send it back");
    return { ...f, r };
  }
  it.each([true, false])(
    "reopens a pre-approved used receipt for one final decision; accepts=%s",
    async (accept) => {
      const f = await adminAcceptedBuyerReturn();
      await expect(markReceived(f.sales.id, f.r.id, false, "")).rejects.toThrow();
      const results = await Promise.allSettled([
        markReceived(f.sales.id, f.r.id, false, "Used, no tags"),
        markReceived(f.factory.id, f.r.id, false, "Used"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await row(f.r.id)).toMatchObject({
        status: "WITH_ADMIN",
        adminDecision: null,
        unusedWithTags: false,
      });
      expect((await row(f.r.id)).receivedAt).not.toBeNull();
      expect(await credits(f.r.id)).toHaveLength(0);
      expect(
        await db.notification.count({
          where: { userId: f.admin.id, title: "Return receipt needs review" },
        }),
      ).toBe(1);
      const race = await Promise.allSettled([
        adminDecide(f.admin.id, f.r.id, accept, "Final receipt review"),
        markReceived(f.sales.id, f.r.id, true),
      ]);
      expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await row(f.r.id)).status).toBe(accept ? "COMPLETED" : "REJECTED");
      expect((await credits(f.r.id)).map((e) => e.amount.toFixed(2))).toEqual(
        accept ? ["3000.00"] : [],
      );
    },
  );
  it("requires approval before pickup or receipt for staff and admins", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    for (const status of ["WAITING_FACTORY", "WITH_ADMIN"] as const) {
      if (status === "WITH_ADMIN")
        await factoryDecide(f.factory.id, r.id, false, now, "Review needed");
      for (const id of [f.factory.id, f.sales.id, f.admin.id]) {
        await expect(markReceived(id, r.id, true)).rejects.toThrow();
        await expect(bookReturnPickup(id, r.id, { externalRef: "early" })).rejects.toThrow();
      }
    }
    expect(await credits(r.id)).toHaveLength(0);
  });
  it("keeps admin-factory messages private, readable after decision, and deduplicates unread notices", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await expect(postReturnMessage(f.sales.id, r.id, "Early")).rejects.toThrow();
    await factoryDecide(f.factory.id, r.id, false, now, "Review seam");
    await Promise.all([
      postReturnMessage(f.sales.id, r.id, "Please inspect"),
      postReturnMessage(f.sales.id, r.id, "Sleeve seam"),
    ]);
    expect(
      await db.notification.count({
        where: { userId: f.admin.id, title: "New return message", readAt: null },
      }),
    ).toBe(1);
    expect((await listReturnMessages(f.admin.id, r.id)).map((m) => m.body)).toEqual([
      "Please inspect",
      "Sleeve seam",
    ]);
    expect(
      await db.notification.count({
        where: { userId: f.admin.id, title: "New return message", readAt: null },
      }),
    ).toBe(0);
    await postReturnMessage(f.sales.id, r.id, "Another detail");
    expect(
      await db.notification.count({
        where: { userId: f.admin.id, title: "New return message", readAt: null },
      }),
    ).toBe(1);
    await postReturnMessage(f.admin.id, r.id, "I will review");
    expect(
      (await listReturnMessages(f.sales.id, r.id)).some((m) => m.body === "I will review"),
    ).toBe(true);
    const otherFactory = await db.user.create({
      data: { role: "SELLER", name: "Other", email: "return-other@test.lk", passwordHash: "x" },
    });
    const packing = await db.user.create({
      data: {
        role: "SELLER",
        name: "Packing",
        email: "return-packing@test.lk",
        passwordHash: "x",
        factoryId: f.factory.id,
        factoryRole: "PACKING",
      },
    });
    for (const actor of [
      f.buyer,
      f.other,
      otherFactory,
      packing,
      await makeUser("ADMIN", "PREMIUM"),
      await makeUser("ADMIN"),
    ]) {
      await expect(listReturnMessages(actor.id, r.id)).rejects.toThrow();
      await expect(postReturnMessage(actor.id, r.id, "Secret")).rejects.toThrow();
    }
    await adminDecide(f.admin.id, r.id, false, "Not eligible");
    expect(await listReturnMessages(f.sales.id, r.id)).toHaveLength(4);
    await expect(postReturnMessage(f.admin.id, r.id, "Late")).rejects.toThrow();
  });
  it("validates message length and serializes the per-user rate limit", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await factoryDecide(f.factory.id, r.id, false, now, "Review");
    for (const text of [" ", "x".repeat(1001)])
      await expect(postReturnMessage(f.sales.id, r.id, text)).rejects.toThrow();
    const results = await Promise.allSettled(
      Array.from({ length: 11 }, (_, i) => postReturnMessage(f.sales.id, r.id, `Message ${i}`)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(await listReturnMessages(f.admin.id, r.id)).toHaveLength(10);
  });
  it.each(["owner", "admin"])(
    "captures delivery time through the %s path and preserves it on retry",
    async (path) => {
      const f = await fixture();
      await db.groupCart.update({ where: { id: f.cart.id }, data: { status: "DISPATCHED" } });
      const delivery = await db.delivery.update({
        where: { cartId: f.cart.id },
        data: { status: "PICKED_UP", deliveredAt: null },
      });
      const { markReceived: receiveDelivery, setDeliveryStatus } =
        await import("@/server/delivery");
      if (path === "owner") await receiveDelivery(f.buyer.id, f.cart.id);
      else await setDeliveryStatus(delivery.id, "DELIVERED");
      const first = await db.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(first.deliveredAt).not.toBeNull();
      await setDeliveryStatus(delivery.id, "DELIVERED");
      expect(
        (await db.delivery.findUniqueOrThrow({ where: { id: delivery.id } })).deliveredAt,
      ).toEqual(first.deliveredAt);
    },
  );
  it("enforces inclusive delivery window, timestamp and factory photo", async () => {
    const f = await fixture();
    await expect(
      fileReturn(f.buyer.id, f.line.id, input(), new Date("2026-11-03T10:01:00Z")),
    ).rejects.toThrow();
    await expect(
      fileReturn(f.buyer.id, f.line.id, { ...input(), photos: [] }, now),
    ).rejects.toThrow(/photo/i);
    await db.delivery.update({ where: { cartId: f.cart.id }, data: { deliveredAt: null } });
    await expect(fileReturn(f.buyer.id, f.line.id, input(), now)).rejects.toThrow();
    await db.delivery.update({ where: { cartId: f.cart.id }, data: { deliveredAt } });
    expect(
      (await fileReturn(f.buyer.id, f.line.id, input(), new Date("2026-11-03T10:00:00Z"))).status,
    ).toBe("WAITING_FACTORY");
  });
  it("allows only the line buyer to file; only owner and SALES decide", async () => {
    const f = await fixture(),
      stranger = await makeUser();
    for (const id of [f.other.id, stranger.id, f.factory.id])
      await expect(fileReturn(id, f.line.id, input(), now)).rejects.toThrow();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await db.user.update({ where: { id: f.sales.id }, data: { factoryRole: "PACKING" } });
    await expect(factoryDecide(f.sales.id, r.id, true, now)).rejects.toThrow();
    await db.user.update({ where: { id: f.sales.id }, data: { factoryRole: "SALES" } });
    await factoryDecide(f.sales.id, r.id, true, now);
    expect((await row(r.id)).status).toBe("ACCEPTED");
  });
  it("records manual FACTORY pickup and credits only once at receipt", async () => {
    const f = await fixture(),
      warehouse = await makeUser("ADMIN");
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await factoryDecide(f.factory.id, r.id, false, now, "Please review");
    await adminDecide(f.admin.id, r.id, true, "Defect confirmed");
    expect(await credits(r.id)).toHaveLength(0);
    expect(
      await db.notification.count({
        where: { userId: warehouse.id, title: "Return pickup needed" },
      }),
    ).toBe(1);
    await bookReturnPickup(f.admin.id, r.id, { externalRef: "PickMe-123", driverName: "Nimal" });
    expect(await row(r.id)).toMatchObject({
      pickupRef: "PickMe-123",
      pickupBookedById: f.admin.id,
      paidBy: "FACTORY",
    });
    const outcomes = await Promise.allSettled([
      markReceived(f.factory.id, r.id, true),
      markReceived(f.factory.id, r.id, true),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await credits(r.id)).map((e) => e.amount.toFixed(2))).toEqual(["1500.00"]);
    expect(await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } })).toMatchObject({
      status: "RETURNED",
      notEarned: true,
      returnedQty: 1,
    });
    expect(await db.delivery.count({ where: { cartId: f.cart.id } })).toBe(1);
  });
  it("limits partial quantities, keeps line active until all returned", async () => {
    const f = await fixture(3),
      r = await fileReturn(f.buyer.id, f.line.id, input(2), now);
    await expect(fileReturn(f.buyer.id, f.line.id, input(2), now)).rejects.toThrow();
    await factoryDecide(f.factory.id, r.id, true, now);
    await markReceived(f.factory.id, r.id, true);
    expect(await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } })).toMatchObject({
      returnedQty: 2,
      status: "ACTIVE",
      notEarned: false,
    });
    await expect(fileReturn(f.buyer.id, f.line.id, input(2), now)).rejects.toThrow();
    const last = await fileReturn(f.buyer.id, f.line.id, input(1), now);
    await factoryDecide(f.factory.id, last.id, true, now);
    await markReceived(f.factory.id, last.id, true);
    expect(
      (
        await db.tokenEntry.aggregate({
          where: { userId: f.buyer.id, kind: "RETURN" },
          _sum: { amount: true },
        })
      )._sum.amount?.toFixed(2),
    ).toBe("4500.00");
    expect(await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } })).toMatchObject({
      returnedQty: 3,
      status: "RETURNED",
      notEarned: true,
    });
  });
  it("escalates silence through sweep and refuses late factory decisions", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    const late = new Date(now.getTime() + 48 * 3600000 + 1);
    const { sweep } = await import("@/server/carts/service");
    await sweep(late);
    expect((await row(r.id)).status).toBe("WITH_ADMIN");
    await expect(factoryDecide(f.factory.id, r.id, true, late)).rejects.toThrow(
      /already been decided/,
    );
  });
  it("serializes factory decision racing timeout", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await Promise.allSettled([
      factoryDecide(f.factory.id, r.id, true, now),
      escalateOverdue(new Date(now.getTime() + 48 * 3600000 + 1)),
    ]);
    expect(["ACCEPTED", "WITH_ADMIN"]).toContain((await row(r.id)).status);
    const state = (await row(r.id)).status;
    expect(
      await db.notification.count({
        where: { userId: f.buyer.id, title: { in: ["Return accepted", "Return sent to admin"] } },
      }),
    ).toBe(1);
    expect(
      await db.notification.count({
        where: {
          userId: f.buyer.id,
          title: state === "ACCEPTED" ? "Return sent to admin" : "Return accepted",
        },
      }),
    ).toBe(0);
  });
  it("rejects, escalates, serializes final admin decisions; no early credit", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await factoryDecide(f.factory.id, r.id, false, now, "Review needed");
    expect(await credits(r.id)).toHaveLength(0);
    const results = await Promise.allSettled([
      adminDecide(f.admin.id, r.id, true, "Defect confirmed"),
      adminDecide(f.admin.id, r.id, false, "Rejected"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((r) => r.status === "rejected");
    expect(loser?.status === "rejected" && loser.reason.message).toBe(
      "This return has already been decided",
    );
    expect(await credits(r.id)).toHaveLength(0);
    await expect(adminDecide(f.admin.id, r.id, true, "Again")).rejects.toThrow();
  });
  it("rejects buyer-fault used item at receipt; final admin acceptance credits it", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(1, "BUYER"), now);
    await factoryDecide(f.factory.id, r.id, true, now);
    await markReceived(f.factory.id, r.id, false, "Tags removed");
    expect(await row(r.id)).toMatchObject({
      status: "WITH_ADMIN",
      receivedCondition: "Tags removed",
    });
    expect(await credits(r.id)).toHaveLength(0);
    await adminDecide(f.admin.id, r.id, true, "Approve after review");
    expect((await credits(r.id)).map((e) => e.amount.toFixed(2))).toEqual(["1500.00"]);
    await expect(adminDecide(f.admin.id, r.id, true, "Again")).rejects.toThrow();
  });
  it("moves open returns to admin on removal and denies factory access", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    const photo = await db.returnPhoto.findFirstOrThrow({ where: { returnId: r.id } });
    await removeFactory(f.admin.id, f.factory.id, "Repeated defects", false);
    expect((await row(r.id)).status).toBe("WITH_ADMIN");
    await expect(factoryDecide(f.sales.id, r.id, true, now)).rejects.toThrow();
    expect(await returnPhotoFor(f.sales.id, photo.id)).toBeNull();
  });
  it("hands final accepted returns to admins on removal without overturning acceptance", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await factoryDecide(f.factory.id, r.id, false, now, "Review needed");
    await adminDecide(f.admin.id, r.id, true, "Defect confirmed");
    await removeFactory(f.admin.id, f.factory.id, "Repeated defects", false);
    expect(await row(r.id)).toMatchObject({ status: "WITH_ADMIN", adminDecision: true });
    await expect(markReceived(f.factory.id, r.id, true)).rejects.toThrow();
    await markReceived(f.admin.id, r.id, true);
    expect((await row(r.id)).status).toBe("COMPLETED");
    expect(await credits(r.id)).toHaveLength(1);
  });
  it("refuses invalid photos, quantities and non-quality admin decisions", async () => {
    const f = await fixture();
    for (const qty of [0, -1, 1.5, 2])
      await expect(fileReturn(f.buyer.id, f.line.id, input(qty), now)).rejects.toThrow();
    await expect(
      fileReturn(
        f.buyer.id,
        f.line.id,
        { ...input(), photos: Array.from({ length: 6 }, giftPhotoFile) },
        now,
      ),
    ).rejects.toThrow();
    await expect(
      fileReturn(
        f.buyer.id,
        f.line.id,
        { ...input(), photos: [new File(["x"], "x.pdf", { type: "application/pdf" })] },
        now,
      ),
    ).rejects.toThrow();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await factoryDecide(f.factory.id, r.id, false, now, "Review needed");
    for (const actor of [
      f.buyer,
      f.factory,
      await makeUser("ADMIN", "PREMIUM"),
      await makeUser("ADMIN"),
    ])
      await expect(adminDecide(actor.id, r.id, true, "Approve")).rejects.toThrow();
    await adminDecide(f.admin.id, r.id, false, "Not eligible");
    expect(await credits(r.id)).toHaveLength(0);
  });
  it("allows the factory exactly at its 24-hour boundary and refuses it one minute later", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await expect(
      factoryDecide(f.factory.id, r.id, true, new Date(now.getTime() + 24 * 3600000 + 60000)),
    ).rejects.toThrow(/already been decided/);
    await factoryDecide(f.factory.id, r.id, true, new Date(now.getTime() + 24 * 3600000));
    expect((await row(r.id)).status).toBe("ACCEPTED");
  });
  it("scopes private photos to buyer, own owner/SALES and FACTORY/CORE admins", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    const photo = await db.returnPhoto.findFirstOrThrow({ where: { returnId: r.id } });
    const core = await makeUser("ADMIN", "CORE"),
      premium = await makeUser("ADMIN", "PREMIUM");
    const otherFactory = await db.user.create({
      data: {
        name: "Other factory",
        email: "other-factory@test.lk",
        passwordHash: "x",
        role: "SELLER",
      },
    });
    const get = async (id: string | null) => {
      principal.user = id ? { id } : null;
      return GET(new Request("http://localhost/api/return-photos/" + photo.id), {
        params: Promise.resolve({ id: photo.id }),
      });
    };
    expect((await get(null)).status).toBe(404);
    for (const id of [f.buyer.id, f.factory.id, f.sales.id, f.admin.id, core.id]) {
      const response = await get(id);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }
    for (const id of [f.other.id, premium.id, otherFactory.id, (await makeUser("ADMIN")).id])
      expect((await get(id)).status).toBe(404);
    for (const id of [f.buyer.id, f.factory.id, f.sales.id, f.admin.id, core.id])
      expect(await returnPhotoFor(id, photo.id)).not.toBeNull();
    for (const id of [f.other.id, premium.id, "unknown"])
      expect(await returnPhotoFor(id, photo.id)).toBeNull();
    await db.user.update({ where: { id: f.sales.id }, data: { factoryRole: "PACKING" } });
    expect(await returnPhotoFor(f.sales.id, photo.id)).toBeNull();
    expect((await get(f.sales.id)).status).toBe(404);
  });
});
