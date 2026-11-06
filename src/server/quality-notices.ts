import { deliverUnreadThreadNotice } from "./private-thread";
import "server-only";
import { db } from "./db";
import { notify } from "./notify";
/** Unpaid lines are deleted, so their buyer notices need a durable outbox separate from lines. */
export async function flushQualityNotices() {
  const pending = await db.qualityNotice.findMany({
    where: { deliveredAt: null },
    select: { id: true, userId: true, title: true, body: true, href: true },
  });
  for (const item of pending) {
    if (item.title === "New hold message") {
      await db.$transaction(async (tx) => {
        const holdId = item.id.split(":")[1];
        await tx.$queryRaw`SELECT 1 FROM "FaultHold" WHERE id=${holdId} FOR NO KEY UPDATE`;
        const pending = await tx.qualityNotice.findUnique({
          where: { id: item.id },
          select: { deliveredAt: true },
        });
        if (!pending || pending.deliveredAt) return;
        if (await tx.user.count({ where: { id: item.userId, locked: false } }))
          await deliverUnreadThreadNotice(tx, { ...item, id: `quality:${item.id}:${item.userId}` });
        await tx.qualityNotice.update({
          where: { id: item.id },
          data: { deliveredAt: new Date() },
        });
      });
      continue;
    }
    if (await db.user.count({ where: { id: item.userId, locked: false } }))
      await notify(
        [item.userId],
        { title: item.title, body: item.body, href: item.href },
        `quality:${item.id}`,
      );
    await db.qualityNotice.update({ where: { id: item.id }, data: { deliveredAt: new Date() } });
  }
}
