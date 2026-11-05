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
    await notify(
      [item.userId],
      { title: item.title, body: item.body, href: item.href },
      `quality:${item.id}`,
    );
    await db.qualityNotice.update({ where: { id: item.id }, data: { deliveredAt: new Date() } });
  }
}
