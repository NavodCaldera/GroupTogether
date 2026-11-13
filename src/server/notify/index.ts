import "server-only";
import { db } from "../db";

type Notice = { title: string; body: string; href?: string };

export { appUrl } from "@/lib/app-url";

/** In-app notification for each user. Call after the transaction that caused it commits. */
export async function notify(userIds: string[], notice: Notice, deduplicationKey?: string) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({
      ...(deduplicationKey ? { id: `${deduplicationKey}:${userId}` } : {}),
      userId,
      ...notice,
      href: notice.href ?? null,
    })),
    skipDuplicates: !!deduplicationKey,
  });
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
