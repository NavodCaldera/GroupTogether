import "server-only";
import { D } from "@/lib/decimal";
import { db } from "./db";
import { lockGroup, releasePackSpot } from "./packs-join";
import { post } from "./tokens";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_EXTENSIONS = 2;

/** Frees spots whose payment window ran out; drops a basket whose owner never paid. */
async function expireHolds(now: Date): Promise<number> {
  const due = await db.packMember.findMany({
    where: { status: "HELD", heldUntil: { lte: now } },
    select: { attempts: { where: { status: "PENDING" }, select: { id: true } } },
  });
  let n = 0;
  for (const m of due) {
    for (const a of m.attempts) {
      try {
        await db.$transaction(async (tx) => {
          await releasePackSpot(tx, a.id);
          await tx.paymentAttempt.updateMany({
            where: { id: a.id, status: "PENDING" },
            data: { status: "EXPIRED" },
          });
        });
        n++;
      } catch (error) {
        console.error("Basket hold expiry will retry", a.id, error);
      }
    }
  }
  return n;
}

/** Due baskets extend by the pack's duration twice, then close and refund paid spots as tokens. */
async function extendOrClose(now: Date): Promise<{ extended: number; closed: number }> {
  const due = await db.packGroup.findMany({
    where: { status: "OPEN", closesAt: { lte: now } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const out = { extended: 0, closed: 0 };
  for (const { id } of due) {
    try {
      const r = await db.$transaction(async (tx) => {
        const g = await lockGroup(tx, id);
        if (!g || g.status !== "OPEN" || !g.closesAt || g.closesAt > now) return null;
        const row = await tx.packGroup.findUniqueOrThrow({
          where: { id },
          select: { extensions: true, version: { select: { pack: { select: { name: true, durationDays: true } } } } },
        });
        const pack = row.version.pack;
        if (row.extensions < MAX_EXTENSIONS) {
          await tx.packGroup.update({
            where: { id },
            data: {
              extensions: { increment: 1 },
              closesAt: new Date(g.closesAt.getTime() + pack.durationDays * DAY_MS),
            },
          });
          return "extended" as const;
        }
        await tx.packGroup.update({ where: { id }, data: { status: "CLOSED" } });
        const paid = await tx.packMember.findMany({
          where: { groupId: id, status: "PAID" },
          select: { id: true, userId: true },
          orderBy: { userId: "asc" },
        });
        for (const m of paid) {
          await post(tx, {
            userId: m.userId,
            amount: new D(g.price),
            kind: "PACK_REFUND",
            eventKey: `pack-refund:${m.id}`,
            note: `${pack.name} basket did not fill`,
          });
        }
        return "closed" as const;
      });
      if (r) out[r]++;
    } catch (error) {
      console.error("Basket close will retry", id, error);
    }
  }
  return out;
}

/** Daily sweep step for family-pack baskets (DEC-030). */
export async function sweepPackGroups(now: Date): Promise<number> {
  const held = await expireHolds(now);
  const { extended, closed } = await extendOrClose(now);
  return held + extended + closed;
}
