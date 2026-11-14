import { afterAll, afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import * as quality from "@/server/quality";
import { db } from "@/server/db";
import { runSweep } from "@/server/sweep";
import {
  factoryDecide,
  adminDecide,
  fileReturn,
  collectReturn,
  buyerFaultDecide,
} from "@/server/returns";
import { recordFault, countedFaultUnits } from "@/server/fault-holds";
import {
  makeAgent,
  makeReceivedOrder,
  makeUser,
  makeVariant,
  resetDb,
  giftPhotoFile,
} from "./helpers";
beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());
afterAll(() => db.$disconnect());
const now = new Date("2026-11-06T10:00:00Z");
async function fixture() {
  const factory = await db.user.update({
    where: { id: (await makeUser()).id },
    data: {
      role: "SELLER",
      factoryProfile: { create: { complianceDueAt: new Date("2099-01-01") } },
    },
  });
  const admin = await makeUser("ADMIN", "FACTORY"),
    buyer = await makeUser();
  const v = await makeVariant("1500", 40);
  await db.product.update({ where: { id: v.productId }, data: { sellerId: factory.id } });
  const agent = await makeAgent();
  return { factory, admin, buyer, v, agent };
}
async function request(
  f: Awaited<ReturnType<typeof fixture>>,
  qty = 1,
  fault: "FACTORY" | "BUYER" = "FACTORY",
) {
  const o = await makeReceivedOrder({
    qty,
    receivedAt: now,
    factory: { factory: f.factory, variant: f.v },
    agent: f.agent,
  });
  return fileReturn(
    o.buyer.id,
    o.line.id,
    {
      qty,
      fault,
      reason: fault === "FACTORY" ? "DAMAGED" : null,
      buyerReason: fault === "BUYER" ? "SIZE" : null,
      note: "Seam",
      photos: fault === "FACTORY" ? [giftPhotoFile()] : [],
    },
    now,
  );
}
/** Faults are recorded when the agent collects an accepted factory-fault return. */
async function accept(f: Awaited<ReturnType<typeof fixture>>, id: string) {
  const r = await db.returnRequest.findUniqueOrThrow({ where: { id } });
  if (r.fault === "BUYER")
    await buyerFaultDecide((await makeUser("ADMIN", "AGENTS")).id, id, true, "", now);
  else await factoryDecide(f.factory.id, id, true, now);
  await collectReturn(f.agent.user.id, id, now);
}
describe("factory faults", () => {
  it("factory accepts qty 3: one fault with 3 units and a hold", async () => {
    const f = await fixture(),
      r = await request(f, 3);
    await factoryDecide(f.factory.id, r.id, true, now);
    expect(await db.factoryFault.count()).toBe(0);
    await collectReturn(f.agent.user.id, r.id, now);
    expect(await db.factoryFault.findMany()).toMatchObject([
      { units: 3, confirmedBy: "FACTORY", confirmedById: f.factory.id, recordedAt: now },
    ]);
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(1);
  });
  it("qty 1 then qty 1 opens a hold on the second", async () => {
    const f = await fixture();
    await accept(f, (await request(f)).id);
    expect(await db.faultHold.count()).toBe(0);
    await accept(f, (await request(f)).id);
    expect(await db.faultHold.count()).toBe(1);
  });
  it("buyer-fault accepts and rejections record no faults", async () => {
    const f = await fixture();
    await accept(f, (await request(f, 1, "BUYER")).id);
    const r = await request(f);
    await factoryDecide(f.factory.id, r.id, false, now, "Review");
    await adminDecide(f.admin.id, r.id, false, "No defect");
    expect(await db.factoryFault.count()).toBe(0);
  });
  it("admin accepts factory fault; collection records it as the admin's", async () => {
    const f = await fixture(),
      r = await request(f);
    await factoryDecide(f.factory.id, r.id, false, now, "Review");
    await adminDecide(f.admin.id, r.id, true, "Confirmed");
    await collectReturn(f.agent.user.id, r.id, now);
    expect(await db.factoryFault.findUnique({ where: { returnId: r.id } })).toMatchObject({
      confirmedBy: "ADMIN",
      units: 1,
      confirmedById: f.admin.id,
    });
  });
  it("calendar window boundary and cancelled faults", async () => {
    const f = await fixture();
    for (const date of ["2026-06-05", "2027-06-05"]) {
      const r = await request(f);
      await db.$transaction((tx) => recordFault(tx, r, "FACTORY", f.factory.id, new Date(date)));
    }
    expect(await countedFaultUnits(db, f.factory.id, new Date("2027-06-06"))).toBe(1);
    await db.factoryFault.updateMany({
      data: { cancelledAt: now, cancelledById: f.admin.id, cancelNote: "Mistake" },
    });
    expect(await countedFaultUnits(db, f.factory.id, new Date("2027-06-06"))).toBe(0);
  });
  it("two faults eleven months apart open a hold; same return records once", async () => {
    const f = await fixture(),
      r = await request(f),
      s = await request(f);
    await db.$transaction((tx) =>
      recordFault(tx, r, "FACTORY", f.factory.id, new Date("2026-01-01")),
    );
    await db.$transaction((tx) =>
      recordFault(tx, s, "FACTORY", f.factory.id, new Date("2026-12-01")),
    );
    await db.$transaction((tx) =>
      recordFault(tx, s, "FACTORY", f.factory.id, new Date("2026-12-01")),
    );
    expect(await db.factoryFault.count()).toBe(2);
    expect(await db.faultHold.count()).toBe(1);
  });
  it("parallel accepts reaching 2 open one hold", async () => {
    const f = await fixture();
    await accept(f, (await request(f)).id);
    const a = await request(f),
      b = await request(f);
    const results = await Promise.allSettled([accept(f, a.id), accept(f, b.id)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(1);
    expect(await db.factoryFault.count()).toBe(3);
  });
  it("removed factory opens no hold", async () => {
    const f = await fixture(),
      r = await request(f, 3);
    await db.factoryProfile.update({
      where: { factoryUserId: f.factory.id },
      data: { status: "REMOVED" },
    });
    await db.returnRequest.update({ where: { id: r.id }, data: { status: "WITH_ADMIN" } });
    await adminDecide(f.admin.id, r.id, true, "Confirmed");
    await collectReturn(f.agent.user.id, r.id, now);
    expect(await db.factoryFault.count()).toBe(1);
    expect(await db.faultHold.count()).toBe(0);
  });
  it("hold notices go only to owners and FACTORY/CORE", async () => {
    const f = await fixture(),
      core = await makeUser("ADMIN", "CORE"),
      premium = await makeUser("ADMIN", "PREMIUM"),
      warehouse = await makeUser("ADMIN");
    const staff = [];
    for (const role of ["OWNER", "SALES", "PACKING"] as const)
      staff.push(
        await db.user.update({
          where: { id: (await makeUser()).id },
          data: { role: "SELLER", factoryId: f.factory.id, factoryRole: role },
        }),
      );
    await accept(f, (await request(f, 2)).id);
    for (const id of [f.factory.id, staff[0].id])
      expect(
        await db.notification.count({ where: { userId: id, title: "Your shop is on hold" } }),
      ).toBe(1);
    for (const id of [core.id, f.admin.id])
      expect(await db.notification.count({ where: { userId: id, title: "Factory on hold" } })).toBe(
        1,
      );
    for (const id of [premium.id, warehouse.id, staff[1].id, staff[2].id])
      expect(
        await db.notification.count({
          where: { userId: id, title: { in: ["Your shop is on hold", "Factory on hold"] } },
        }),
      ).toBe(0);
  });
});
import { enforceHold } from "@/server/fault-holds";
import { hideProduct, removeFactory } from "@/server/quality";
import { canSellIn } from "@/server/agreements";
import { saveProduct } from "@/server/catalogue";
import { postReturnMessage } from "@/server/returns";
describe("hold enforcement and removal", () => {
  it("hides the factory's products and marks the hold cleaned, idempotently", async () => {
    const f = await fixture();
    const hold = await db.faultHold.create({ data: { factoryId: f.factory.id } });
    await enforceHold(hold.id);
    await enforceHold(hold.id);
    expect(await db.product.findUniqueOrThrow({ where: { id: f.v.productId } })).toMatchObject({
      hiddenByHoldId: hold.id,
      hiddenReason: "Factory fault limit",
    });
    expect(
      (await db.faultHold.findUniqueOrThrow({ where: { id: hold.id } })).cleanedAt,
    ).not.toBeNull();
  });
  it("keeps an existing admin hide and blocks sales while allowing returns and threads", async () => {
    const f = await fixture(),
      v = await makeVariant("1500", 2);
    await db.product.update({
      where: { id: v.productId },
      data: {
        sellerId: f.factory.id,
        hiddenAt: now,
        hiddenReason: "Admin hide",
        hiddenById: f.admin.id,
      },
    });
    const hold = await db.faultHold.create({ data: { factoryId: f.factory.id } });
    await enforceHold(hold.id);
    expect(await db.product.findUniqueOrThrow({ where: { id: v.productId } })).toMatchObject({
      hiddenByHoldId: null,
      hiddenReason: "Admin hide",
    });
    expect(await canSellIn(db, f.factory.id, new Date())).toBe(false);
    await expect(
      saveProduct(
        null,
        { title: "Shirt", brand: "Test", audience: "MEN", kind: "men-shirts", price: "1400" },
        null,
        { sellerId: f.factory.id },
      ),
    ).rejects.toThrow();
    const r = await request(f);
    await factoryDecide(f.factory.id, r.id, false, now, "Review");
    await postReturnMessage(f.factory.id, r.id, "Please review");
  });
});
import {
  decideHold,
  cancelFault,
  postHoldMessage,
  listHoldMessages,
  factoryFaults,
  adminHolds,
} from "@/server/fault-holds";
async function held() {
  const f = await fixture(),
    r = await request(f, 2);
  await accept(f, r.id);
  const hold = await db.faultHold.findFirstOrThrow();
  return { ...f, r, hold };
}
describe("hold decisions and private discussion", () => {
  it("continue restores only its hidden products and the next fault reopens", async () => {
    const f = await fixture(),
      v = await makeVariant("1500", 2);
    await db.product.update({
      where: { id: v.productId },
      data: { sellerId: f.factory.id, hiddenAt: now, hiddenReason: "Admin hide" },
    });
    await accept(f, (await request(f, 2)).id);
    const hold = await db.faultHold.findFirstOrThrow();
    await decideHold(f.admin.id, hold.id, "CONTINUE", "Reviewed");
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: f.v.productId } })).hiddenAt,
    ).toBeNull();
    expect((await db.product.findUniqueOrThrow({ where: { id: v.productId } })).hiddenReason).toBe(
      "Admin hide",
    );
    await accept(f, (await request(f)).id);
    expect(await db.faultHold.count()).toBe(2);
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(1);
  });
  it("admin hides during a hold stay hidden on continue", async () => {
    const f = await held();
    await hideProduct(f.admin.id, f.v.productId, "Separate quality issue");
    await decideHold(f.admin.id, f.hold.id, "CONTINUE", "Reviewed");
    expect(await db.product.findUniqueOrThrow({ where: { id: f.v.productId } })).toMatchObject({
      hiddenByHoldId: null,
      hiddenReason: "Separate quality issue",
    });
  });
  it("remove closes hold and locks staff; direct removal also closes holds", async () => {
    const f = await held();
    const staff = await db.user.update({
      where: { id: (await makeUser()).id },
      data: { role: "SELLER", factoryId: f.factory.id, factoryRole: "OWNER" },
    });
    await decideHold(f.admin.id, f.hold.id, "REMOVE", "Repeated faults");
    expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).locked).toBe(true);
    expect((await db.faultHold.findUniqueOrThrow({ where: { id: f.hold.id } })).decision).toBe(
      "REMOVE",
    );
  });
  it("direct removal closes an open hold", async () => {
    const f = await held();
    await removeFactory(f.admin.id, f.factory.id, "Repeated faults", false);
    expect(await db.faultHold.findUniqueOrThrow({ where: { id: f.hold.id } })).toMatchObject({
      decision: "REMOVE",
    });
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(0);
  });
  it("two decisions give one outcome", async () => {
    const f = await held();
    const results = await Promise.allSettled([
      decideHold(f.admin.id, f.hold.id, "CONTINUE", "Reviewed"),
      decideHold(f.admin.id, f.hold.id, "REMOVE", "Repeated faults"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.faultHold.findUniqueOrThrow({ where: { id: f.hold.id } })).decidedAt,
    ).not.toBeNull();
  });
  it("cancelling a fault needs a note, keeps history and stops counting without closing hold", async () => {
    const f = await held(),
      fault = await db.factoryFault.findFirstOrThrow();
    for (const note of [" ", "x".repeat(2001)])
      await expect(cancelFault(f.admin.id, fault.id, note)).rejects.toThrow();
    await cancelFault(f.admin.id, fault.id, "Mistaken fault");
    expect(await countedFaultUnits(db, f.factory.id, new Date())).toBe(0);
    expect(await db.factoryFault.findUniqueOrThrow({ where: { id: fault.id } })).toMatchObject({
      cancelNote: "Mistaken fault",
      cancelledById: f.admin.id,
    });
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(1);
  });
  it("owners and FACTORY/CORE share a thread, unread notices deduplicate, and history stays readable", async () => {
    const f = await held(),
      core = await makeUser("ADMIN", "CORE"),
      owner = await db.user.update({
        where: { id: (await makeUser()).id },
        data: { role: "SELLER", factoryId: f.factory.id, factoryRole: "OWNER" },
      });
    await postHoldMessage(owner.id, f.hold.id, "Seams checked");
    await postHoldMessage(f.factory.id, f.hold.id, "Inspection done");
    expect(
      await db.notification.count({
        where: { userId: f.admin.id, title: "New hold message", readAt: null },
      }),
    ).toBe(1);
    expect(await listHoldMessages(f.admin.id, f.hold.id)).toHaveLength(2);
    expect(
      await db.notification.count({
        where: { userId: f.admin.id, title: "New hold message", readAt: null },
      }),
    ).toBe(0);
    await postHoldMessage(core.id, f.hold.id, "Continue after review");
    expect(await listHoldMessages(owner.id, f.hold.id)).toHaveLength(3);
    expect((await factoryFaults(owner.id)).faults).toHaveLength(1);
    expect(await adminHolds(core.id)).toHaveLength(1);
    await decideHold(core.id, f.hold.id, "CONTINUE", "Reviewed");
    expect(await listHoldMessages(f.factory.id, f.hold.id)).toHaveLength(3);
    await expect(postHoldMessage(owner.id, f.hold.id, "Late")).rejects.toThrow();
  });
  it("denies outsiders with not found, including staff, other factories, buyers and admin areas", async () => {
    const f = await held();
    const outsiders = [
      f.buyer,
      await makeUser("ADMIN", "PREMIUM"),
      await makeUser("ADMIN"),
      await fixture().then((x) => x.factory),
    ];
    for (const role of ["SALES", "PACKING"] as const)
      outsiders.push(
        await db.user.update({
          where: { id: (await makeUser()).id },
          data: { role: "SELLER", factoryId: f.factory.id, factoryRole: role },
        }),
      );
    for (const u of outsiders) {
      await expect(listHoldMessages(u.id, f.hold.id)).rejects.toThrow(/not found/i);
      await expect(postHoldMessage(u.id, f.hold.id, "Secret")).rejects.toThrow(/not found/i);
      if (u.role === "SELLER" && u.factoryId === null)
        expect((await factoryFaults(u.id)).faults).toHaveLength(0);
      else await expect(factoryFaults(u.id)).rejects.toThrow();
      await expect(
        cancelFault(u.id, (await db.factoryFault.findFirstOrThrow()).id, "Mistake"),
      ).rejects.toThrow();
      await expect(decideHold(u.id, f.hold.id, "CONTINUE", "Review")).rejects.toThrow();
    }
  });
  it("validates notes, body length and ten messages per minute", async () => {
    const f = await held();
    for (const note of [" ", "x".repeat(2001)])
      await expect(decideHold(f.admin.id, f.hold.id, "CONTINUE", note)).rejects.toThrow();
    for (const body of [" ", "x".repeat(1001)])
      await expect(postHoldMessage(f.factory.id, f.hold.id, body)).rejects.toThrow();
    const results = await Promise.allSettled(
      Array.from({ length: 11 }, (_, i) =>
        postHoldMessage(f.factory.id, f.hold.id, `Message ${i}`),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
  });
});

it("enforcement flushes a pending hold message only after releasing its gate", async () => {
  const f = await fixture();
  const hold = await db.faultHold.create({ data: { factoryId: f.factory.id } });
  const id = `hold-message:${hold.id}:interrupted:${f.admin.id}`;
  await db.qualityNotice.create({
    data: {
      id,
      userId: f.admin.id,
      title: "New hold message",
      body: "",
      href: `/admin/factory/quality?hold=${hold.id}`,
    },
  });
  await enforceHold(hold.id);
  expect((await db.qualityNotice.findUniqueOrThrow({ where: { id } })).deliveredAt).not.toBeNull();
  expect(
    await db.notification.count({
      where: { userId: f.admin.id, title: "New hold message", readAt: null },
    }),
  ).toBe(1);
});

describe("review recovery regressions", () => {
  it("the cron sweep finishes an open hold's cleanup", async () => {
    const f = await fixture();
    const hold = await db.faultHold.create({ data: { factoryId: f.factory.id } });
    expect((await runSweep()).faultHolds).toBe(1);
    expect(
      (await db.faultHold.findUniqueOrThrow({ where: { id: hold.id } })).cleanedAt,
    ).not.toBeNull();
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: f.v.productId } })).hiddenByHoldId,
    ).toBe(hold.id);
  });
  it("sweep recovers a committed Remove decision after removal fails, once", async () => {
    const f = await held();
    const staff = await db.user.update({
      where: { id: (await makeUser()).id },
      data: { role: "SELLER", factoryId: f.factory.id, factoryRole: "PACKING" },
    });
    const remove = vi
      .spyOn(quality, "removeFactory")
      .mockRejectedValueOnce(new Error("Simulated removal failure"));
    await expect(decideHold(f.admin.id, f.hold.id, "REMOVE", "Repeated faults")).rejects.toThrow(
      "Simulated removal failure",
    );
    const decision = await db.faultHold.findUniqueOrThrow({ where: { id: f.hold.id } });
    expect(decision).toMatchObject({
      decision: "REMOVE",
      decidedById: f.admin.id,
      decisionNote: "Repeated faults",
    });
    expect(decision.decidedAt).not.toBeNull();
    expect(
      (await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: f.factory.id } }))
        .status,
    ).toBe("ACTIVE");
    await runSweep();
    expect(
      (await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: f.factory.id } }))
        .status,
    ).toBe("REMOVED");
    expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).locked).toBe(true);
    const profile = await db.factoryProfile.findUniqueOrThrow({
      where: { factoryUserId: f.factory.id },
    });
    await runSweep();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(
      await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: f.factory.id } }),
    ).toEqual(profile);
    expect(await db.faultHold.findUniqueOrThrow({ where: { id: f.hold.id } })).toEqual(decision);
  });
  it("one failed removal does not block other holds", async () => {
    const bad = await fixture(),
      good = await fixture();
    for (const f of [bad, good])
      await db.faultHold.create({
        data: {
          factoryId: f.factory.id,
          decision: "REMOVE",
          decidedAt: new Date(),
          decidedById: f.admin.id,
          decisionNote: "Repeated faults",
        },
      });
    const original = quality.removeFactory;
    vi.spyOn(quality, "removeFactory").mockImplementation(
      (adminId, factoryId, reason, hold, note) =>
        factoryId === bad.factory.id
          ? Promise.reject(new Error("Still failing"))
          : original(adminId, factoryId, reason, hold, note),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runSweep();
    expect(
      (await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: good.factory.id } }))
        .status,
    ).toBe("REMOVED");
    expect(
      (await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: bad.factory.id } }))
        .status,
    ).toBe("ACTIVE");
  });
});
