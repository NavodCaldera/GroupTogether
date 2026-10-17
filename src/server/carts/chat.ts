import "server-only";
import { z } from "zod";
import { db } from "../db";
import { notify } from "../notify";
import { CartError } from "./service";

export const messageSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(500, "Keep it under 500 characters"),
});

const PER_MINUTE = 10;

/**
 * Who a user is talking to in a cart's chat: the owner talks to one participant at a time, every
 * other user only has their own thread with the owner. The owner can only reply, except to
 * someone asking to join the cart, whom they may message first.
 */
function threadParticipant(cart: { ownerId: string }, userId: string, withId?: string | null) {
  if (userId !== cart.ownerId) return userId;
  if (!withId || withId === cart.ownerId) throw new CartError("Choose who to reply to");
  return withId;
}

export async function sendMessage(userId: string, cartId: string, body: string, withId?: string) {
  const { body: text } = messageSchema.parse({ body });
  const cart = await db.groupCart.findUnique({
    where: { id: cartId },
    select: { id: true, code: true, name: true, ownerId: true },
  });
  if (!cart) throw new CartError("Cart not found");
  const participantId = threadParticipant(cart, userId, withId);
  if (userId === cart.ownerId) {
    const known = await db.cartMessage.count({ where: { cartId, participantId } });
    if (known === 0 && !(await askingToJoin(cartId, participantId)))
      throw new CartError("That person hasn't written to you");
  }
  const recent = await db.cartMessage.count({
    where: { cartId, authorId: userId, createdAt: { gt: new Date(Date.now() - 60_000) } },
  });
  if (recent >= PER_MINUTE) throw new CartError("You're sending messages too fast. Wait a moment.");
  const [msg, author] = await Promise.all([
    db.cartMessage.create({ data: { cartId, participantId, authorId: userId, body: text } }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
  ]);
  const to = userId === cart.ownerId ? participantId : cart.ownerId;
  const href = conversationHref(cart.id, participantId);
  // One unread notice per conversation is enough; more would only be noise.
  const pending = await db.notification.count({ where: { userId: to, href, readAt: null } });
  if (!pending)
    await notify([to], {
      title: `New message from ${author.name}`,
      body: text.length > 80 ? `${text.slice(0, 80)}…` : text,
      href,
    });
  return msg;
}

export async function listMessages(userId: string, cartId: string, withId?: string | null) {
  const cart = await db.groupCart.findUnique({ where: { id: cartId }, select: { ownerId: true } });
  if (!cart) throw new CartError("Cart not found");
  const participantId = threadParticipant(cart, userId, withId);
  // Opening a conversation reads it: the other side's messages and its notice.
  const read = await db.cartMessage.updateMany({
    where: { cartId, participantId, authorId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });
  if (read.count > 0)
    await db.notification.updateMany({
      where: { userId, href: conversationHref(cartId, participantId), readAt: null },
      data: { readAt: new Date() },
    });
  const rows = await db.cartMessage.findMany({
    where: { cartId, participantId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, authorId: true, body: true, createdAt: true, readAt: true },
  });
  // `seen` drives the sender's ticks: one grey tick sent, two green ticks seen.
  return rows.map(({ readAt, ...m }) => ({ ...m, seen: readAt !== null }));
}

/** The owner may write first only to someone with a pending request to join their cart. */
async function askingToJoin(cartId: string, userId: string) {
  const n = await db.cartMergeRequest.count({
    where: { toCartId: cartId, userId, status: "PENDING" },
  });
  return n > 0;
}

/**
 * A conversation the owner is about to start with someone asking to join (no messages yet), or
 * null if they can't. The Messages page uses it to open an empty thread.
 */
export async function newThreadWith(ownerId: string, cartId: string, withId: string) {
  const cart = await db.groupCart.findUnique({ where: { id: cartId }, select: { ownerId: true } });
  if (cart?.ownerId !== ownerId || !(await askingToJoin(cartId, withId))) return null;
  const other = await db.user.findUnique({ where: { id: withId }, select: { name: true } });
  return other && { cartId, participantId: withId, otherName: other.name, asOwner: true };
}

/** Where a conversation lives: the Messages inbox, opened on that thread. */
export function conversationHref(cartId: string, participantId: string) {
  return `/messages?c=${cartId}&with=${participantId}`;
}

/** Messages waiting for this user: written by the other side of one of their conversations. */
function unreadFor(userId: string) {
  return {
    readAt: null,
    authorId: { not: userId },
    OR: [{ participantId: userId }, { cart: { ownerId: userId } }],
  };
}

export async function unreadMessageCount(userId: string) {
  return db.cartMessage.count({ where: unreadFor(userId) });
}

/**
 * Every conversation this user is in, newest first: as a cart owner (one per person who wrote)
 * and as a buyer (one per cart owner they wrote to), with the last message and unread count.
 */
export async function inbox(userId: string) {
  const mine = { OR: [{ participantId: userId }, { cart: { ownerId: userId } }] };
  const [threads, unread] = await Promise.all([
    db.cartMessage.groupBy({
      by: ["cartId", "participantId"],
      where: mine,
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: 100,
    }),
    db.cartMessage.groupBy({
      by: ["cartId", "participantId"],
      where: unreadFor(userId),
      _count: true,
    }),
  ]);
  if (threads.length === 0) return [];
  const [last, carts] = await Promise.all([
    db.cartMessage.findMany({
      where: {
        OR: threads.map((t) => ({
          cartId: t.cartId,
          participantId: t.participantId,
          createdAt: t._max.createdAt!,
        })),
      },
      select: { cartId: true, participantId: true, body: true, authorId: true, createdAt: true },
    }),
    db.groupCart.findMany({
      where: { id: { in: [...new Set(threads.map((t) => t.cartId))] } },
      select: {
        id: true,
        code: true,
        name: true,
        ownerId: true,
        owner: { select: { name: true } },
      },
    }),
  ]);
  const people = await db.user.findMany({
    where: { id: { in: [...new Set(threads.map((t) => t.participantId))] } },
    select: { id: true, name: true },
  });
  const key = (c: string, p: string) => `${c}:${p}`;
  const lastBy = new Map(last.map((m) => [key(m.cartId, m.participantId), m]));
  const unreadBy = new Map(unread.map((u) => [key(u.cartId, u.participantId), u._count]));
  const cartBy = new Map(carts.map((c) => [c.id, c]));
  const nameBy = new Map(people.map((u) => [u.id, u.name]));
  return threads.flatMap((t) => {
    const cart = cartBy.get(t.cartId);
    const msg = lastBy.get(key(t.cartId, t.participantId));
    if (!cart || !msg) return [];
    const asOwner = cart.ownerId === userId;
    return [
      {
        cartId: cart.id,
        cartCode: cart.code,
        cartName: cart.name || cart.code,
        participantId: t.participantId,
        asOwner,
        /** The person on the other side */
        otherName: asOwner ? (nameBy.get(t.participantId) ?? "Buyer") : cart.owner.name,
        lastBody: msg.body,
        lastFromMe: msg.authorId === userId,
        lastAt: msg.createdAt,
        unread: unreadBy.get(key(t.cartId, t.participantId)) ?? 0,
      },
    ];
  });
}

export type InboxThread = Awaited<ReturnType<typeof inbox>>[number];

/** The owner's inbox: people who wrote about this cart, newest conversation first. */
export async function threadsFor(cartId: string) {
  const rows = await db.cartMessage.groupBy({
    by: ["participantId"],
    where: { cartId },
    _max: { createdAt: true },
    _count: true,
    orderBy: { _max: { createdAt: "desc" } },
  });
  const [users, unread] = await Promise.all([
    db.user.findMany({
      where: { id: { in: rows.map((r) => r.participantId) } },
      select: { id: true, name: true },
    }),
    db.cartMessage.groupBy({
      by: ["participantId"],
      // In the owner's view, unread means written by the buyer.
      where: { cartId, readAt: null, authorId: { equals: db.cartMessage.fields.participantId } },
      _count: true,
    }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const waiting = new Map(unread.map((u) => [u.participantId, u._count]));
  return rows.map((r) => ({
    participantId: r.participantId,
    name: name.get(r.participantId) ?? "Buyer",
    count: r._count,
    unread: waiting.get(r.participantId) ?? 0,
  }));
}
