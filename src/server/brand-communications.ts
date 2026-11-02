import "server-only";
import { canAdminArea } from "@/lib/admin-access";
import { db, type Tx } from "./db";
import { CatalogueError } from "./catalogue";

export async function communicationActor(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true, adminArea: true, isBrand: true, locked: true, name: true },
  });
  if (
    !user ||
    user.locked ||
    (!canAdminArea(user, "PREMIUM") && !(user.role === "SELLER" && user.isBrand))
  )
    throw new CatalogueError("This workspace is for admins and premium brands only");
  return user;
}
export type CommunicationActor = Awaited<ReturnType<typeof communicationActor>>;
export const conversationHref = (admin: boolean, id: string) =>
  `${admin ? "/admin/brands" : "/seller"}?tab=messages&thread=${encodeURIComponent(id)}`;
export const subjectHref = (admin: boolean, kind: string, subject: string, brand?: string) =>
  `${admin ? "/admin/brands" : "/seller"}?tab=messages&kind=${kind}&subject=${encodeURIComponent(subject)}${brand ? `&brand=${encodeURIComponent(brand)}` : ""}`;

export async function subjectContext(
  actor: CommunicationActor,
  brandId: string,
  kind: string,
  subjectId: string,
) {
  if (actor.role !== "ADMIN" && brandId !== actor.id)
    throw new CatalogueError("Conversation not found");
  const brand = await db.user.findFirst({
    where: {
      id: brandId,
      role: "SELLER",
      isBrand: true,
      ...(actor.role === "ADMIN" ? {} : { locked: false }),
    },
    select: { id: true, company: true, name: true },
  });
  if (!brand) throw new CatalogueError("Brand not found");
  let title = "Partnership discussion";
  let summary = "";
  if (kind === "PRODUCT") {
    const offer = await db.stockOffer.findFirst({
      where: { id: subjectId, sellerId: brandId },
      select: { name: true, status: true },
    });
    if (!offer) throw new CatalogueError("Gift product not found");
    title = offer.name;
    summary = `Product · ${offer.status.replaceAll("_", " ")}`;
  } else if (kind === "GIFT") {
    const gift = await db.giftOrder.findFirst({
      where: {
        id: subjectId,
        offer: { sellerId: brandId },
        ...(actor.role === "ADMIN" ? {} : { paidAt: { not: null } }),
      },
      select: { status: true, offer: { select: { name: true } } },
    });
    if (!gift) throw new CatalogueError("Gift order not found");
    title = `${gift.offer.name} · G-${subjectId.slice(-8).toUpperCase()}`;
    summary = gift.status.replaceAll("_", " ");
  } else if (kind === "SETTLEMENT") {
    const settlement = await db.giftSettlement.findFirst({
      where: { id: subjectId, brandId },
      select: { reference: true, amount: true },
    });
    if (!settlement) throw new CatalogueError("Settlement not found");
    title = settlement.reference;
    summary = `Settlement · LKR ${settlement.amount}`;
  } else if (kind !== "GENERAL" || subjectId !== "general")
    throw new CatalogueError("Choose a valid conversation subject");
  return {
    brandId,
    brandName: brand.company || brand.name,
    kind,
    subjectId,
    title,
    summary,
    contextKey: `${brandId}:${kind}:${subjectId}`,
  };
}

/** Called inside the business transaction. Notifications are delivered only after commit. */
export async function appendBrandEvent(
  tx: Tx,
  data: {
    brandId: string;
    kind: string;
    subjectId: string;
    title: string;
    authorId: string;
    body: string;
    requestKey: string;
  },
) {
  const { brandId, kind, subjectId, title, authorId, body, requestKey } = data;
  const conversation = await tx.brandConversation.upsert({
    where: { contextKey: `${brandId}:${kind}:${subjectId}` },
    create: { brandId, kind, subjectId, title, contextKey: `${brandId}:${kind}:${subjectId}` },
    update: { title, updatedAt: new Date() },
  });
  return tx.brandMessage.upsert({
    where: { requestKey },
    create: { conversationId: conversation.id, authorId, body, system: true, requestKey },
    update: {},
  });
}

export async function flushBrandNotices() {
  const pending = await db.brandMessage.findMany({
    where: { notifiedAt: null },
    include: { conversation: true, author: { select: { role: true } } },
    take: 50,
    orderBy: { createdAt: "asc" },
  });
  for (const message of pending) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "BrandConversation" WHERE id=${message.conversationId} FOR UPDATE`;
      if ((await tx.brandMessage.findUniqueOrThrow({ where: { id: message.id } })).notifiedAt)
        return;
      const adminSender = message.author.role === "ADMIN";
      const recipients =
        message.internal || !adminSender
          ? await tx.user.findMany({
              where: {
                role: "ADMIN",
                adminArea: "PREMIUM",
                locked: false,
                id: { not: message.authorId },
              },
              select: { id: true, role: true },
            })
          : await tx.user.findMany({
              where: {
                id: message.conversation.brandId,
                role: "SELLER",
                isBrand: true,
                locked: false,
              },
              select: { id: true, role: true },
            });
      for (const user of recipients) {
        if (
          user.role !== "ADMIN" &&
          message.conversation.kind === "GIFT" &&
          !(await tx.giftOrder.count({
            where: {
              id: message.conversation.subjectId,
              paidAt: { not: null },
              offer: { sellerId: user.id },
            },
          }))
        )
          continue;
        const read = await tx.brandConversationRead.findUnique({
          where: {
            conversationId_userId: { conversationId: message.conversationId, userId: user.id },
          },
        });
        if (read && read.readAt >= message.createdAt) continue;
        const key = `brand-thread:${message.conversationId}:${user.id}`;
        await tx.notification.upsert({
          where: { dedupeKey: key },
          create: {
            userId: user.id,
            dedupeKey: key,
            title: message.system ? "Brand workspace update" : "New partnership message",
            body: message.conversation.title,
            href: conversationHref(user.role === "ADMIN", message.conversationId),
          },
          update: {
            title: message.system ? "Brand workspace update" : "New partnership message",
            body: message.conversation.title,
            readAt: null,
            createdAt: new Date(),
          },
        });
      }
      await tx.brandMessage.update({ where: { id: message.id }, data: { notifiedAt: new Date() } });
    });
  }
}

export async function sendBrandMessage(
  actorId: string,
  input: {
    thread?: string;
    brandId: string;
    kind: string;
    subjectId: string;
    body: string;
    internal?: boolean;
    requestKey: string;
  },
) {
  const actor = await communicationActor(actorId);
  const text = input.body.trim();
  if (!text || text.length > 2000 || input.requestKey.length < 10 || input.requestKey.length > 150)
    throw new CatalogueError("Write a message of 1–2,000 characters");
  if (input.internal && actor.role !== "ADMIN")
    throw new CatalogueError("Internal notes are for admins only");
  const prior = await db.brandMessage.findUnique({ where: { requestKey: input.requestKey } });
  if (prior) {
    if (prior.authorId !== actorId) throw new CatalogueError("Invalid message reference");
    return prior.conversationId;
  }
  if (
    (await db.brandMessage.count({
      where: { authorId: actorId, createdAt: { gt: new Date(Date.now() - 60000) }, system: false },
    })) >= 10
  )
    throw new CatalogueError("Please wait a moment before sending more messages");
  const context = input.thread
    ? await contextForThread(actor, input.thread)
    : await subjectContext(
        actor,
        actor.role === "ADMIN" ? input.brandId : actor.id,
        input.kind,
        input.subjectId,
      );
  const thread = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${input.requestKey})::bigint)`;
    const retry = await tx.brandMessage.findUnique({ where: { requestKey: input.requestKey } });
    if (retry) {
      if (retry.authorId !== actorId) throw new CatalogueError("Invalid message reference");
      return retry.conversationId;
    }
    const conversation = await tx.brandConversation.upsert({
      where: { contextKey: context.contextKey },
      create: {
        brandId: context.brandId,
        kind: context.kind,
        subjectId: context.subjectId,
        title: context.title,
        contextKey: context.contextKey,
      },
      update: {},
    });
    await tx.$queryRaw`SELECT 1 FROM "BrandConversation" WHERE id=${conversation.id} FOR UPDATE`;
    const duplicate = await tx.brandMessage.findUnique({ where: { requestKey: input.requestKey } });
    if (duplicate) {
      if (duplicate.authorId !== actorId) throw new CatalogueError("Invalid message reference");
      return duplicate.conversationId;
    }
    await tx.brandMessage.create({
      data: {
        conversationId: conversation.id,
        authorId: actorId,
        body: text,
        internal: !!input.internal,
        requestKey: input.requestKey,
      },
    });
    await tx.brandConversation.update({
      where: { id: conversation.id },
      data: {
        updatedAt: new Date(),
        ...(!input.internal
          ? { resolved: false, lastHumanSide: actor.role === "ADMIN" ? "ADMIN" : "BRAND" }
          : {}),
      },
    });
    return conversation.id;
  });
  await flushBrandNotices().catch(() => {});
  return thread;
}

export async function contextForThread(actor: CommunicationActor, id: string) {
  const thread = await db.brandConversation.findFirst({
    where: { id, ...(actor.role === "ADMIN" ? {} : { brandId: actor.id }) },
  });
  if (!thread) throw new CatalogueError("Conversation not found");
  return {
    ...(await subjectContext(actor, thread.brandId, thread.kind, thread.subjectId)),
    id: thread.id,
    resolved: thread.resolved,
  };
}

export async function markBrandThreadRead(actorId: string, threadId: string, through: Date) {
  const actor = await communicationActor(actorId);
  await contextForThread(actor, threadId);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "BrandConversation" WHERE id=${threadId} FOR UPDATE`;
    const read = await tx.brandConversationRead.findUnique({
      where: { conversationId_userId: { conversationId: threadId, userId: actorId } },
    });
    if (!read || read.readAt < through)
      await tx.brandConversationRead.upsert({
        where: { conversationId_userId: { conversationId: threadId, userId: actorId } },
        create: { conversationId: threadId, userId: actorId, readAt: through },
        update: { readAt: through },
      });
    const newer = await tx.brandMessage.count({
      where: {
        conversationId: threadId,
        createdAt: { gt: through },
        authorId: { not: actorId },
        ...(actor.role === "ADMIN" ? {} : { internal: false }),
      },
    });
    if (!newer)
      await tx.notification.updateMany({
        where: {
          userId: actorId,
          dedupeKey: `brand-thread:${threadId}:${actorId}`,
        },
        data: { readAt: new Date() },
      });
  });
}

export async function resolveBrandThread(actorId: string, threadId: string, resolved: boolean) {
  const actor = await communicationActor(actorId);
  const context = await contextForThread(actor, threadId);
  await db.$transaction(async (tx) => {
    await tx.brandConversation.update({
      where: { id: threadId },
      data: { resolved, updatedAt: new Date() },
    });
    await appendBrandEvent(tx, {
      ...context,
      authorId: actorId,
      body: resolved ? "Conversation marked resolved." : "Conversation reopened.",
      requestKey: `thread-state:${threadId}:${crypto.randomUUID()}`,
    });
  });
  await flushBrandNotices().catch(() => {});
}

export async function brandInbox(actorId: string, brandId?: string) {
  const actor = await communicationActor(actorId);
  await flushBrandNotices().catch(() => {});
  const rows = await db.brandConversation.findMany({
    where: {
      ...(actor.role !== "ADMIN" ? { brandId: actor.id } : brandId ? { brandId } : {}),
      ...(actor.role === "ADMIN"
        ? {}
        : {
            OR: [
              { kind: { not: "GIFT" } },
              {
                subjectId: {
                  in: (
                    await db.giftOrder.findMany({
                      where: { offer: { sellerId: actor.id }, paidAt: { not: null } },
                      select: { id: true },
                    })
                  ).map((g) => g.id),
                },
              },
            ],
          }),
    },
    include: {
      brand: { select: { company: true, name: true } },
      reads: { where: { userId: actorId } },
      messages: {
        where: actor.role === "ADMIN" ? {} : { internal: false },
        select: { id: true, authorId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .filter((row) => row.messages.length)
    .map(({ messages, reads, ...thread }) => ({
      ...thread,
      unread: messages.filter(
        (message) =>
          message.authorId !== actorId && (!reads[0] || message.createdAt > reads[0].readAt),
      ).length,
      needsReply:
        !thread.resolved && thread.lastHumanSide === (actor.role === "ADMIN" ? "BRAND" : "ADMIN"),
    }));
}
