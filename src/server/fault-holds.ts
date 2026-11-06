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
}
