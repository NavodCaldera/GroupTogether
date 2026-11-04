import "server-only";
import type { OperationalAdminArea } from "@/lib/admin-access";
import { db } from "../db";

export type Notice = { title: string; body: string; href?: string };

export function appUrl(path = "") {
  return `${(process.env.APP_URL || "http://localhost:3002").replace(/\/$/, "")}${path}`;
}

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

/** Every user with one of these roles (locked accounts left out), for staff notices. */
export async function notifyRole(
  role: "ADMIN" | "PACKER",
  notice: Notice,
  area?: OperationalAdminArea,
) {
  const users = await db.user.findMany({
    where: {
      role,
      locked: false,
      ...(role === "ADMIN" && area ? { adminArea: area } : {}),
    },
    select: { id: true },
  });
  await notify(
    users.map((u) => u.id),
    notice,
  );
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
