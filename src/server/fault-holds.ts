import "server-only";
import type { ReturnRequest, FaultHold } from "@/generated/prisma/client";
import { db, type Tx } from "./db";

/** Caller owns the factory advisory (before cart/return locks). No other carts are locked here. */
export async function countedFaultUnits(client: Tx, factoryId: string, now: Date): Promise<number> {
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - 12);
  return (
    (
      await client.factoryFault.aggregate({
        where: { factoryId, cancelledAt: null, recordedAt: { gt: since } },
        _sum: { units: true },
      })
    )._sum.units ?? 0
  );
}
export async function recordFault(
  tx: Tx,
  r: ReturnRequest,
  by: "FACTORY" | "ADMIN",
  byId: string,
  now: Date,
): Promise<FaultHold | null> {
  if (r.fault !== "FACTORY") return null;
  const inserted = await tx.factoryFault.createMany({
    data: [
      {
        returnId: r.id,
        factoryId: r.factoryId,
        units: r.qty,
        recordedAt: now,
        confirmedBy: by,
        confirmedById: byId,
      },
    ],
    skipDuplicates: true,
  });
  if (!inserted.count || (await countedFaultUnits(tx, r.factoryId, now)) < 2) return null;
  if (await tx.factoryProfile.count({ where: { factoryUserId: r.factoryId, status: "REMOVED" } }))
    return null;
  const id = crypto.randomUUID();
  const opened = await tx.faultHold.createMany({
    data: [{ id, factoryId: r.factoryId, openedAt: now }],
    skipDuplicates: true,
  });
  if (!opened.count) return null;
  const owners = await tx.user.findMany({
    where: {
      role: "SELLER",
      locked: false,
      OR: [{ id: r.factoryId }, { factoryId: r.factoryId, factoryRole: "OWNER" }],
    },
    select: { id: true },
  });
  const admins = await tx.user.findMany({
    where: { role: "ADMIN", locked: false, adminArea: { in: ["FACTORY", "CORE"] } },
    select: { id: true },
  });
  for (const [people, title, href] of [
    [owners, "Your shop is on hold", `/seller/returns?hold=${id}`],
    [admins, "Factory on hold", `/admin/factory/quality?hold=${id}`],
  ] as const)
    for (const user of people)
      await tx.qualityNotice.create({
        data: { id: `hold:${id}:${user.id}`, userId: user.id, title, body: "", href },
      });
  return tx.faultHold.findUniqueOrThrow({ where: { id } });
}

import { lockUserAdvisory } from "./carts/locks";
import { cleanFactoryCarts } from "./quality";
import { flushCancellationNotices } from "./cancellations";
import { flushQualityNotices } from "./quality-notices";
/** Hold row is a gate across committed metadata and per-cart work. No factory/product/cart
 * locks survive from one stage into the next. Decisions wait here; crashes leave cleanedAt null. */
export async function enforceHold(holdId: string): Promise<void> {
  await db.$transaction(
    async (gate) => {
      await gate.$queryRaw`SELECT 1 FROM "FaultHold" WHERE id=${holdId} FOR NO KEY UPDATE`;
      const hold = await gate.faultHold.findUnique({ where: { id: holdId } });
      if (!hold || hold.decidedAt || hold.cleanedAt) return;
      const removed = await db.$transaction(async (tx) => {
        await lockUserAdvisory(tx, hold.factoryId);
        const profile = await tx.factoryProfile.findUniqueOrThrow({
          where: { factoryUserId: hold.factoryId },
        });
        if (profile.status === "REMOVED") return true;
        await tx.$queryRaw`SELECT 1 FROM "Product" WHERE "sellerId"=${hold.factoryId} ORDER BY id FOR UPDATE`;
        await tx.product.updateMany({
          where: { sellerId: hold.factoryId, hiddenAt: null },
          data: {
            hiddenAt: hold.openedAt,
            hiddenReason: "Factory fault limit",
            hiddenByHoldId: hold.id,
          },
        });
        return false;
      });
      await cleanFactoryCarts(hold.factoryId, "Factory fault limit", hold.factoryId);
      await gate.faultHold.update({
        where: { id: hold.id },
        data: {
          cleanedAt: new Date(),
          ...(removed
            ? { decision: "REMOVE", decidedAt: new Date(), decisionNote: "Factory removed" }
            : {}),
        },
      });
    },
    { maxWait: 10000, timeout: 120000 },
  );
  await flushQualityNotices();
  await flushCancellationNotices();
}

import type { FactoryFault } from "@/generated/prisma/client";
import { factoryOf } from "@/lib/factory-roles";
import { CartError } from "./carts/errors";
import { assertQualityAdmin, removeFactory } from "./quality";
import { messageText, checkMessageRate, readThreadNotice } from "./private-thread";
export class HoldError extends CartError {}
const missing = () => new HoldError("Hold not found");
function noteValue(note: string) {
  const value = note.trim();
  if (!value || value.length > 2000) throw new HoldError("Add a note from 1 to 2000 characters");
  return value;
}
async function holdActor(tx: Tx, userId: string, factoryId: string) {
  const user = await tx.user.findFirst({
    where: { id: userId, locked: false },
    select: {
      id: true,
      role: true,
      adminArea: true,
      isBrand: true,
      factoryId: true,
      factoryRole: true,
    },
  });
  if (!user) throw missing();
  if (user.role === "ADMIN" && ["FACTORY", "CORE"].includes(user.adminArea ?? ""))
    return "admin" as const;
  if (
    user.role === "SELLER" &&
    !user.isBrand &&
    factoryOf(user).factoryId === factoryId &&
    factoryOf(user).factoryRole === "OWNER"
  )
    return "factory" as const;
  throw missing();
}
export async function decideHold(
  adminId: string,
  holdId: string,
  decision: "CONTINUE" | "REMOVE",
  note: string,
): Promise<FaultHold> {
  await assertQualityAdmin(adminId);
  const text = noteValue(note);
  if (!["CONTINUE", "REMOVE"].includes(decision)) throw new HoldError("Choose Continue or Remove");
  const hold = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "FaultHold" WHERE id=${holdId} FOR NO KEY UPDATE`;
    const hold = await tx.faultHold.findUnique({ where: { id: holdId } });
    if (!hold) throw missing();
    if (hold.decidedAt) throw new HoldError("This hold has already been decided");
    const removed = await tx.factoryProfile.count({
      where: { factoryUserId: hold.factoryId, status: "REMOVED" },
    });
    const choice = removed ? "REMOVE" : decision;
    if (choice === "CONTINUE") {
      await tx.$queryRaw`SELECT 1 FROM "Product" WHERE "hiddenByHoldId"=${hold.id} ORDER BY id FOR UPDATE`;
      await tx.product.updateMany({
        where: { hiddenByHoldId: hold.id },
        data: { hiddenAt: null, hiddenReason: null, hiddenById: null, hiddenByHoldId: null },
      });
    }
    return tx.faultHold.update({
      where: { id: hold.id },
      data: { decision: choice, decisionNote: text, decidedAt: new Date(), decidedById: adminId },
    });
  });
  if (hold.decision === "REMOVE") await removeFactory(adminId, hold.factoryId, text, false);
  return hold;
}
/** Removal calls after releasing its factory advisory, so it cannot invert the hold gate. */
export async function closeRemovedHolds(factoryId: string, adminId: string, note: string) {
  await db.faultHold.updateMany({
    where: { factoryId, decidedAt: null },
    data: { decision: "REMOVE", decisionNote: note, decidedAt: new Date(), decidedById: adminId },
  });
}
export async function cancelFault(
  adminId: string,
  faultId: string,
  note: string,
): Promise<FactoryFault> {
  await assertQualityAdmin(adminId);
  const text = noteValue(note);
  await db.factoryFault.updateMany({
    where: { id: faultId, cancelledAt: null },
    data: { cancelledAt: new Date(), cancelledById: adminId, cancelNote: text },
  });
  return db.factoryFault.findUniqueOrThrow({ where: { id: faultId } });
}
function holdHref(id: string, side: "admin" | "factory") {
  return `${side === "admin" ? "/admin/factory/quality" : "/seller/returns"}?hold=${id}`;
}
export async function postHoldMessage(userId: string, holdId: string, body: string) {
  const text = messageText(body);
  const message = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "FaultHold" WHERE id=${holdId} FOR NO KEY UPDATE`;
    await lockUserAdvisory(tx, userId);
    const hold = await tx.faultHold.findUnique({ where: { id: holdId } });
    if (!hold) throw missing();
    const side = await holdActor(tx, userId, hold.factoryId);
    if (hold.decidedAt) throw new HoldError("This hold has already been decided");
    const now = new Date();
    await checkMessageRate(tx, userId, now);
    const message = await tx.faultHoldMessage.create({
      data: { holdId, authorId: userId, body: text, createdAt: now },
    });
    const users = await tx.user.findMany({
      where:
        side === "admin"
          ? {
              role: "SELLER",
              locked: false,
              OR: [{ id: hold.factoryId }, { factoryId: hold.factoryId, factoryRole: "OWNER" }],
            }
          : { role: "ADMIN", locked: false, adminArea: { in: ["FACTORY", "CORE"] } },
      select: { id: true },
    });
    for (const user of users)
      await tx.qualityNotice.create({
        data: {
          id: `hold-message:${holdId}:${message.id}:${user.id}`,
          userId: user.id,
          title: "New hold message",
          body: "",
          href: holdHref(holdId, side === "admin" ? "factory" : "admin"),
        },
      });
    return message;
  });
  await flushQualityNotices();
  return message;
}
export async function listHoldMessages(userId: string, holdId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "FaultHold" WHERE id=${holdId} FOR NO KEY UPDATE`;
    const hold = await tx.faultHold.findUnique({ where: { id: holdId } });
    if (!hold) throw missing();
    const side = await holdActor(tx, userId, hold.factoryId),
      now = new Date();
    await readThreadNotice(tx, userId, holdHref(holdId, side), "New hold message", now);
    await tx.qualityNotice.updateMany({
      where: {
        userId,
        title: "New hold message",
        id: { startsWith: `hold-message:${holdId}:` },
        deliveredAt: null,
      },
      data: { deliveredAt: now },
    });
    const rows = await tx.faultHoldMessage.findMany({
      where: { holdId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
    });
    return rows.reverse();
  });
}
const faultSelect = {
  id: true,
  units: true,
  returnId: true,
  recordedAt: true,
  confirmedBy: true,
  cancelledAt: true,
  cancelNote: true,
  request: {
    select: {
      cartLine: {
        select: { variant: { select: { size: true, product: { select: { title: true } } } } },
      },
    },
  },
} as const;
export async function factoryFaults(userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, role: "SELLER", locked: false, isBrand: false },
    select: { id: true, factoryId: true, factoryRole: true },
  });
  if (!user || factoryOf(user).factoryRole !== "OWNER") throw missing();
  const factoryId = factoryOf(user).factoryId;
  return {
    faults: await db.factoryFault.findMany({
      where: { factoryId },
      select: faultSelect,
      orderBy: { recordedAt: "desc" },
    }),
    holds: await db.faultHold.findMany({ where: { factoryId }, orderBy: { openedAt: "desc" } }),
  };
}
export async function adminHolds(adminId: string) {
  await assertQualityAdmin(adminId);
  return db.faultHold.findMany({
    orderBy: { openedAt: "desc" },
    include: { factory: { select: { name: true, company: true } } },
  });
}
export async function adminFaults(adminId: string) {
  await assertQualityAdmin(adminId);
  return db.factoryFault.findMany({
    orderBy: { recordedAt: "desc" },
    select: { ...faultSelect, factoryId: true, factory: { select: { name: true, company: true } } },
  });
}
