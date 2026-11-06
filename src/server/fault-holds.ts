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
