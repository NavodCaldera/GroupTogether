import "server-only";
import { db } from "../db";
import { mailer } from "./mailer";

export type Notice = { title: string; body: string; href?: string };

export function appUrl(path = "") {
  return `${(process.env.APP_URL || "http://localhost:3002").replace(/\/$/, "")}${path}`;
}

/**
 * In-app notification for each user, plus an email when `email` is set. Call after the
 * transaction that caused it commits. Email failures are logged, never thrown: the in-app
 * notice is the record.
 */
export async function notify(userIds: string[], notice: Notice, { email = false } = {}) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({ userId, ...notice, href: notice.href ?? null })),
  });
  if (!email) return;
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { email: true, name: true },
  });
  const link = notice.href ? `\n\n${appUrl(notice.href)}` : "";
  await Promise.all(
    users.map(async (u) => {
      const res = await mailer().send({
        to: u.email,
        subject: notice.title,
        text: `Hi ${u.name},\n\n${notice.body}${link}\n\n— GroupTogether`,
      });
      if (!res.ok) console.error(`[mail] to ${u.email} failed: ${res.error}`);
    }),
  );
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
