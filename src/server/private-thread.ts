import "server-only";
import type { Tx } from "./db";
import { CartError } from "./carts/errors";
export function messageText(body: string) {
  const text = body.trim();
  if (!text || text.length > 1000) throw new CartError("Write a message from 1 to 1000 characters");
  return text;
}
/** Caller owns the author's advisory, shared across both kinds of private thread. */
export async function checkMessageRate(tx: Tx, authorId: string, now: Date) {
  const where = { authorId, createdAt: { gt: new Date(now.getTime() - 60000) } };
  const count =
    (await tx.returnMessage.count({ where })) + (await tx.faultHoldMessage.count({ where }));
  if (count >= 10) throw new CartError("You're sending messages too fast. Wait a moment.");
}
/** Caller owns the thread row, also used by reads and decisions. */
export async function deliverUnreadThreadNotice(
  tx: Tx,
  item: { id: string; userId: string; title: string; href: string },
) {
  if (
    await tx.notification.count({
      where: { userId: item.userId, title: item.title, href: item.href, readAt: null },
    })
  )
    return;
  await tx.notification.createMany({ data: [{ ...item, body: "" }], skipDuplicates: true });
}
export async function readThreadNotice(
  tx: Tx,
  userId: string,
  href: string,
  title: string,
  now: Date,
) {
  await tx.notification.updateMany({
    where: { userId, href, title, readAt: null },
    data: { readAt: now },
  });
}
