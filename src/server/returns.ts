import "server-only";
import type { ReturnRequest, ReturnStatus } from "@/generated/prisma/client";
import { canMoveReturn, withinWindow, factoryOverdue } from "@/lib/return-rules";
import { REPORT_REASONS, type ReportReason } from "@/lib/quality-rules";
import { factoryOf } from "@/lib/factory-roles";
import { toD } from "@/lib/decimal";
import { db, type Tx } from "./db";
import { CartError } from "./carts/errors";
import { withCartTransaction } from "./carts/locks";
import { checkUpload, IMAGE_TYPES, saveUpload } from "./storage";
import { credit } from "./tokens";
import { assertQualityAdmin } from "./quality";
import { notify } from "./notify";

export class ReturnError extends CartError {}
const decided = () => new ReturnError("This return has already been decided");
export const OPEN_RETURN_STATUSES: ReturnStatus[] = [
  "WAITING_FACTORY",
  "WITH_ADMIN",
  "ACCEPTED",
  "PICKED_UP",
  "RECEIVED",
];
const unresolved = {
  status: { in: OPEN_RETURN_STATUSES },
};

async function activeUser(tx: Tx, id: string) {
  const user = await tx.user.findFirst({
    where: { id, locked: false },
    select: {
      id: true,
      role: true,
      adminArea: true,
      factoryId: true,
      factoryRole: true,
      isBrand: true,
    },
  });
  if (!user) throw new ReturnError("Return access denied");
  return user;
}
async function factoryActor(tx: Tx, id: string, factoryId: string) {
  const user = await activeUser(tx, id);
  const factory = factoryOf(user);
  const profile = await tx.factoryProfile.findUnique({
    where: { factoryUserId: factoryId },
    select: { status: true },
  });
  if (
    user.role !== "SELLER" ||
    user.isBrand ||
    factory.factoryId !== factoryId ||
    !["OWNER", "SALES"].includes(factory.factoryRole) ||
    profile?.status !== "ACTIVE"
  )
    throw new ReturnError("Factory owner or Sales access required");
  return user;
}
async function qualityActor(tx: Tx, id: string) {
  const user = await activeUser(tx, id);
  if (user.role !== "ADMIN" || !["FACTORY", "CORE"].includes(user.adminArea ?? ""))
    throw new ReturnError("Quality admin access required");
}
async function queue(
  tx: Tx,
  request: ReturnRequest,
  event: string,
  title: string,
  side: "buyer" | "factory" | "admin" | "warehouse",
) {
  const users =
    side === "buyer"
      ? [{ id: request.buyerId }]
      : side === "factory"
        ? await tx.user.findMany({
            where: {
              role: "SELLER",
              locked: false,
              OR: [
                { id: request.factoryId },
                { factoryId: request.factoryId, factoryRole: { in: ["OWNER", "SALES"] } },
              ],
              AND: [
                {
                  OR: [
                    { factoryProfile: { is: { status: "ACTIVE" } } },
                    { factory: { factoryProfile: { is: { status: "ACTIVE" } } } },
                  ],
                },
              ],
            },
            select: { id: true },
          })
        : await tx.user.findMany({
            where: {
              role: "ADMIN",
              locked: false,
              adminArea: { in: side === "warehouse" ? ["WAREHOUSE"] : ["FACTORY", "CORE"] },
            },
            select: { id: true },
          });
  const cart =
    side === "buyer"
      ? await tx.cartLine.findUniqueOrThrow({
          where: { id: request.cartLineId },
          select: { cart: { select: { code: true } } },
        })
      : null;
  const href =
    side === "buyer"
      ? `/c/${cart!.cart.code}`
      : side === "factory"
        ? "/seller/returns"
        : `/admin/factory/returns/${request.id}`;
  for (const user of users)
    await tx.returnNotice.upsert({
      where: { id: `${request.id}:${event}:${user.id}` },
      create: {
        id: `${request.id}:${event}:${user.id}`,
        returnId: request.id,
        userId: user.id,
        title,
        href,
      },
      update: {},
    });
}
export async function flushReturnNotices() {
  const items = await db.returnNotice.findMany({
    where: { deliveredAt: null },
    select: { id: true, userId: true, title: true, href: true },
  });
  for (const item of items) {
    // A removal can invalidate queued factory notices before delivery.
    const user = await db.user.findFirst({
      where: { id: item.userId, locked: false },
      select: { role: true, factoryId: true, id: true },
    });
    const removed =
      user?.role === "SELLER" &&
      (await db.factoryProfile.count({
        where: { factoryUserId: user.factoryId ?? user.id, status: "REMOVED" },
      }));
    if (item.title === "New return message") {
      // Serialize unread-notice delivery with thread reads and other deliveries.
      await db.$transaction(async (tx) => {
        const entry = await tx.returnNotice.findUniqueOrThrow({
          where: { id: item.id },
          select: { returnId: true },
        });
        await tx.$queryRaw`SELECT 1 FROM "ReturnRequest" WHERE id=${entry.returnId} FOR UPDATE`;
        const pending = await tx.returnNotice.findUniqueOrThrow({
          where: { id: item.id },
          select: { deliveredAt: true },
        });
        if (pending.deliveredAt) return;
        if (
          user &&
          !removed &&
          !(await tx.notification.count({
            where: { userId: item.userId, href: item.href, title: item.title, readAt: null },
          }))
        )
          await tx.notification.createMany({
            data: [
              {
                id: `return:${item.id}:${item.userId}`,
                userId: item.userId,
                title: item.title,
                body: "",
                href: item.href,
              },
            ],
            skipDuplicates: true,
          });
        await tx.returnNotice.update({ where: { id: item.id }, data: { deliveredAt: new Date() } });
      });
      continue;
    }
    if (user && !removed)
      await notify(
        [item.userId],
        { title: item.title, body: "", href: item.href },
        `return:${item.id}`,
      );
    await db.returnNotice.update({ where: { id: item.id }, data: { deliveredAt: new Date() } });
  }
}
async function move(
  tx: Tx,
  r: ReturnRequest,
  status: ReturnStatus,
  data: import("@/generated/prisma/client").Prisma.ReturnRequestUpdateInput = {},
) {
  if (!canMoveReturn(r.status, status)) throw decided();
  return tx.returnRequest.update({ where: { id: r.id }, data: { ...data, status } });
}
/** Sorted participant/factory advisories -> cart -> return row -> ledger user (credit only). */
async function locked<T>(
  actorId: string | null,
  id: string,
  work: (tx: Tx, r: ReturnRequest) => Promise<T>,
) {
  const first = await db.returnRequest.findUnique({
    where: { id },
    select: { factoryId: true, cartLine: { select: { cartId: true } } },
  });
  if (!first) throw new ReturnError("Return not found");
  const result = await withCartTransaction(
    [first.cartLine.cartId],
    [first.factoryId, ...(actorId ? [actorId] : [])],
    async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "ReturnRequest" WHERE id=${id} FOR UPDATE`;
      const r = await tx.returnRequest.findUniqueOrThrow({ where: { id } });
      return work(tx, r);
    },
  );
  await flushReturnNotices();
  return result;
}
export async function fileReturn(
  buyerId: string,
  cartLineId: string,
  input: {
    reason: ReportReason;
    fault: "FACTORY" | "BUYER";
    note: string;
    photos: File[];
    qty?: number;
  },
  now = new Date(),
) {
  const qty = input.qty ?? 1;
  if (
    !Number.isInteger(qty) ||
    qty < 1 ||
    !REPORT_REASONS.includes(input.reason) ||
    !["FACTORY", "BUYER"].includes(input.fault) ||
    !input.note.trim() ||
    input.note.length > 2000 ||
    input.photos.length > 5
  )
    throw new ReturnError("Check the return details and quantity");
  if (input.fault === "FACTORY" && !input.photos.length)
    throw new ReturnError("Add at least one photo");
  for (const file of input.photos) checkUpload(file, IMAGE_TYPES, "return photo");
  const first = await db.cartLine.findUnique({
    where: { id: cartLineId },
    select: {
      cartId: true,
      userId: true,
      variant: { select: { product: { select: { sellerId: true } } } },
    },
  });
  if (!first || first.userId !== buyerId || !first.variant.product.sellerId)
    throw new ReturnError("Return only your own delivered item");
  const factoryId = first.variant.product.sellerId;
  const r = await withCartTransaction([first.cartId], [buyerId, factoryId], async (tx) => {
    const user = await activeUser(tx, buyerId);
    const line = await tx.cartLine.findUniqueOrThrow({
      where: { id: cartLineId },
      include: { cart: { select: { status: true, delivery: { select: { deliveredAt: true } } } } },
    });
    if (
      user.role !== "CUSTOMER" ||
      line.userId !== buyerId ||
      line.status !== "ACTIVE" ||
      line.cart.status !== "DELIVERED" ||
      !line.cart.delivery?.deliveredAt ||
      !withinWindow(line.cart.delivery.deliveredAt, now)
    )
      throw new ReturnError("Return only your own item within 48 hours of delivery");
    if (
      qty > line.qty - line.returnedQty ||
      (await tx.returnRequest.count({ where: { cartLineId, ...unresolved } }))
    )
      throw new ReturnError("Quantity unavailable or this line already has an open return");
    const photos = [];
    for (const file of input.photos)
      photos.push(await saveUpload(file, "return-photos", IMAGE_TYPES));
    const removed = !!(await tx.factoryProfile.count({
      where: { factoryUserId: factoryId, status: "REMOVED" },
    }));
    const r = await tx.returnRequest.create({
      data: {
        cartLineId,
        buyerId,
        factoryId,
        qty,
        reason: input.reason,
        fault: input.fault,
        note: input.note.trim(),
        createdAt: now,
        factoryDueAt: new Date(now.getTime() + 48 * 3600000),
        status: removed ? "WITH_ADMIN" : "WAITING_FACTORY",
        escalatedAt: removed ? now : null,
        photos: { create: photos },
      },
    });
    await queue(tx, r, "filed", "Return requested", removed ? "admin" : "factory");
    return r;
  });
  await flushReturnNotices();
  return r;
}
export async function factoryDecide(
  staffUserId: string,
  returnId: string,
  accept: boolean,
  now = new Date(),
  note = "",
) {
  if (!accept && (!note.trim() || note.trim().length > 1000))
    throw new ReturnError("Give a refusal reason from 1 to 1000 characters");
  return locked(staffUserId, returnId, async (tx, r) => {
    await factoryActor(tx, staffUserId, r.factoryId);
    if (r.status !== "WAITING_FACTORY" || factoryOverdue(r.createdAt, now)) throw decided();
    const after = await move(tx, r, accept ? "ACCEPTED" : "WITH_ADMIN", {
      factoryDecidedAt: now,
      factoryDecidedById: staffUserId,
      ...(!accept ? { factoryNote: note.trim(), escalatedAt: now } : {}),
    });
    await queue(
      tx,
      after,
      "factory-decision",
      accept ? "Return accepted" : "Return sent to admin",
      "buyer",
    );
    if (!accept) await queue(tx, after, "factory-refused", "Return needs review", "admin");
    if (accept && r.fault === "FACTORY")
      await queue(tx, after, "pickup-needed", "Return pickup needed", "warehouse");
    return after;
  });
}
async function complete(tx: Tx, r: ReturnRequest) {
  if (r.status !== "RECEIVED") throw decided();
  const line = await tx.cartLine.findUniqueOrThrow({ where: { id: r.cartLineId } });
  const returnedQty = line.returnedQty + r.qty;
  if (returnedQty > line.qty) throw new ReturnError("Return quantity exceeds this line");
  const value = toD(line.unitPrice).times(r.qty);
  if (value.gt(0))
    await credit(tx, r.buyerId, value, "RETURN", { returnId: r.id }, "Returned clothing item");
  await tx.cartLine.update({
    where: { id: line.id },
    data: {
      returnedQty,
      ...(returnedQty === line.qty ? { status: "RETURNED", notEarned: true } : {}),
    },
  });
  const after = await move(tx, r, "COMPLETED");
  await queue(tx, after, "completed", "Return tokens credited", "buyer");
  await queue(tx, after, "received", "Return received", "factory");
  return after;
}
export async function adminDecide(
  adminId: string,
  returnId: string,
  accept: boolean,
  note: string,
) {
  if (!note.trim() || note.length > 2000) throw new ReturnError("Add a decision note");
  return locked(adminId, returnId, async (tx, r) => {
    await qualityActor(tx, adminId);
    if (r.status !== "WITH_ADMIN" || r.adminDecision !== null) throw decided();
    let after = await move(tx, r, accept ? "ACCEPTED" : "REJECTED", {
      adminId,
      adminDecision: accept,
      adminNote: note.trim(),
    });
    await queue(
      tx,
      after,
      r.receivedAt ? "admin-receipt-decision" : "admin-decision",
      accept ? "Admin accepted return" : "Admin rejected return",
      "buyer",
    );
    await queue(
      tx,
      after,
      r.receivedAt ? "admin-receipt-decision" : "admin-decision",
      "Admin decided return",
      "factory",
    );
    if (accept && r.receivedAt) {
      after = await move(tx, after, "RECEIVED");
      return complete(tx, after);
    }
    if (accept && r.fault === "FACTORY")
      await queue(tx, after, "pickup-needed", "Return pickup needed", "warehouse");
    return after;
  });
}
export async function markReceived(
  staffUserId: string,
  returnId: string,
  unusedWithTags: boolean,
  note = "",
) {
  if (note.length > 2000) throw new ReturnError("Receipt note is too long");
  return locked(staffUserId, returnId, async (tx, r) => {
    const user = await activeUser(tx, staffUserId);
    if (user.role === "ADMIN") await qualityActor(tx, staffUserId);
    else await factoryActor(tx, staffUserId, r.factoryId);
    if (user.role === "ADMIN" && r.status === "WITH_ADMIN" && r.adminDecision === true)
      r = await move(tx, r, "ACCEPTED");
    if (!["ACCEPTED", "PICKED_UP"].includes(r.status) || r.receivedAt) throw decided();
    const data = {
      receivedAt: new Date(),
      receivedById: staffUserId,
      unusedWithTags,
      receivedCondition: note.trim(),
    };
    if (r.fault === "BUYER" && !unusedWithTags) {
      if (!note.trim() || note.trim().length > 1000)
        throw new ReturnError("Give a condition reason from 1 to 1000 characters");
      const after = await move(tx, r, "WITH_ADMIN", {
        ...data,
        adminDecision: null,
        escalatedAt: new Date(),
      });
      await queue(tx, after, "receipt-review", "Return receipt needs review", "admin");
      await queue(tx, after, "receipt-review", "Return sent to admin", "buyer");
      return after;
    }
    const after = await move(tx, r, "RECEIVED", data);
    return complete(tx, after);
  });
}
export async function bookReturnPickup(
  adminId: string,
  returnId: string,
  input: { externalRef: string; driverName?: string },
) {
  if (
    !input.externalRef.trim() ||
    input.externalRef.length > 200 ||
    (input.driverName?.length ?? 0) > 200
  )
    throw new ReturnError("Enter the PickMe booking reference");
  return locked(adminId, returnId, async (tx, r) => {
    const user = await activeUser(tx, adminId);
    if (user.role !== "ADMIN" || !["FACTORY", "CORE", "WAREHOUSE"].includes(user.adminArea ?? ""))
      throw new ReturnError("Return pickup admin access required");
    if (r.status === "WITH_ADMIN" && r.adminDecision === true) {
      await qualityActor(tx, adminId);
      r = await move(tx, r, "ACCEPTED");
    }
    if (r.status !== "ACCEPTED" || r.fault !== "FACTORY" || r.pickupBookedAt) throw decided();
    const after = await tx.returnRequest.update({
      where: { id: r.id },
      data: {
        pickupRef: input.externalRef.trim(),
        pickupDriver: input.driverName?.trim() || null,
        pickupBookedAt: new Date(),
        pickupBookedById: adminId,
        paidBy: "FACTORY",
      },
    });
    await queue(tx, after, "booked", "Return pickup booked", "buyer");
    await queue(tx, after, "booked", "Return pickup booked", "factory");
    return after;
  });
}
export async function markReturnPickedUp(adminId: string, returnId: string) {
  return locked(adminId, returnId, async (tx, r) => {
    await qualityActor(tx, adminId);
    if (!r.pickupBookedAt || r.status !== "ACCEPTED") throw decided();
    const after = await move(tx, r, "PICKED_UP");
    await queue(tx, after, "picked-up", "Return picked up", "factory");
    await queue(tx, after, "picked-up", "Return picked up", "buyer");
    return after;
  });
}
export async function escalateOverdue(now = new Date()) {
  const rows = await db.returnRequest.findMany({
    where: { status: "WAITING_FACTORY", factoryDueAt: { lt: now } },
    select: { id: true },
  });
  let count = 0;
  for (const r of rows)
    await locked(null, r.id, async (tx, r) => {
      if (r.status !== "WAITING_FACTORY" || !factoryOverdue(r.createdAt, now)) return;
      const after = await move(tx, r, "WITH_ADMIN", { escalatedAt: now });
      count++;
      await queue(tx, after, "overdue", "Return needs review", "admin");
      await queue(tx, after, "overdue", "Return sent to admin", "buyer");
    });
  await flushReturnNotices();
  return count;
}
/** Removal already owns the factory advisory, fencing every return mutation. No ledger/cart locks. */
export async function handoffRemovedReturns(tx: Tx, factoryId: string) {
  const rows = await tx.returnRequest.findMany({
    where: { factoryId, ...unresolved },
    orderBy: { id: "asc" },
  });
  for (const r of rows) {
    await tx.$queryRaw`SELECT 1 FROM "ReturnRequest" WHERE id=${r.id} FOR UPDATE`;
    // A final acceptance survives removal; only an admin can complete its fulfilment.
    if (r.status === "WITH_ADMIN") continue;
    const after = await move(tx, r, "WITH_ADMIN", { escalatedAt: new Date() });
    await queue(tx, after, "removed", "Return needs review", "admin");
    await queue(tx, after, "removed", "Return sent to admin", "buyer");
  }
}
export async function returnPhotoFor(userId: string, photoId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, locked: false },
    select: {
      id: true,
      role: true,
      adminArea: true,
      factoryId: true,
      factoryRole: true,
      isBrand: true,
    },
  });
  if (!user) return null;
  const photo = await db.returnPhoto.findUnique({
    where: { id: photoId },
    select: {
      storageKey: true,
      contentType: true,
      request: { select: { buyerId: true, factoryId: true } },
    },
  });
  if (!photo) return null;
  if (user.id === photo.request.buyerId && user.role === "CUSTOMER")
    return { storageKey: photo.storageKey, contentType: photo.contentType };
  if (user.role === "ADMIN" && ["FACTORY", "CORE"].includes(user.adminArea ?? ""))
    return { storageKey: photo.storageKey, contentType: photo.contentType };
  try {
    await factoryActor(db, userId, photo.request.factoryId);
  } catch {
    return null;
  }
  return { storageKey: photo.storageKey, contentType: photo.contentType };
}
export async function factoryReturns(userId: string) {
  const user = await activeUser(db, userId),
    factory = factoryOf(user);
  await factoryActor(db, userId, factory.factoryId);
  return db.returnRequest.findMany({
    where: { factoryId: factory.factoryId },
    select: returnSelect,
    orderBy: { createdAt: "desc" },
  });
}
async function messageActor(tx: Tx, userId: string, r: ReturnRequest) {
  const user = await activeUser(tx, userId);
  if (user.role === "ADMIN") {
    await qualityActor(tx, userId);
    return "admin" as const;
  }
  await factoryActor(tx, userId, r.factoryId);
  return "factory" as const;
}
function messageHref(returnId: string, side: "admin" | "factory") {
  return side === "admin"
    ? `/admin/factory/returns/${returnId}`
    : `/seller/returns?return=${returnId}`;
}
/** The author advisory serializes the global per-user rate limit; return lock fences decisions/read state. */
export async function postReturnMessage(userId: string, returnId: string, body: string) {
  const text = body.trim();
  if (!text || text.length > 1000)
    throw new ReturnError("Write a message from 1 to 1000 characters");
  return locked(userId, returnId, async (tx, r) => {
    const side = await messageActor(tx, userId, r);
    if (r.status !== "WITH_ADMIN") throw decided();
    const now = new Date();
    if (
      (await tx.returnMessage.count({
        where: { authorId: userId, createdAt: { gt: new Date(now.getTime() - 60000) } },
      })) >= 10
    )
      throw new ReturnError("You're sending messages too fast. Wait a moment.");
    const message = await tx.returnMessage.create({
      data: { returnId, authorId: userId, body: text, createdAt: now },
    });
    await queue(
      tx,
      r,
      `message:${message.id}`,
      "New return message",
      side === "admin" ? "factory" : "admin",
    );
    if (side === "admin")
      await tx.returnNotice.updateMany({
        where: {
          returnId,
          title: "New return message",
          id: { startsWith: `${r.id}:message:${message.id}:` },
        },
        data: { href: messageHref(returnId, "factory") },
      });
    return message;
  });
}
/** Opening a thread reads its unread notice under the same return lock as posting and delivery. */
export async function listReturnMessages(userId: string, returnId: string) {
  return locked(userId, returnId, async (tx, r) => {
    const side = await messageActor(tx, userId, r);
    const now = new Date();
    await tx.notification.updateMany({
      where: {
        userId,
        href: messageHref(returnId, side),
        title: "New return message",
        readAt: null,
      },
      data: { readAt: now },
    });
    await tx.returnNotice.updateMany({
      where: { returnId, userId, title: "New return message", deliveredAt: null },
      data: { deliveredAt: now },
    });
    const rows = await tx.returnMessage.findMany({
      where: { returnId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
    });
    return rows.reverse();
  });
}
export async function adminReturn(adminId: string, id: string) {
  await assertQualityAdmin(adminId);
  return db.returnRequest.findUnique({ where: { id }, select: returnSelect });
}
export async function adminReturns(adminId: string) {
  const user = await activeUser(db, adminId);
  const warehouse = user.role === "ADMIN" && user.adminArea === "WAREHOUSE";
  if (!warehouse) await assertQualityAdmin(adminId);
  return db.returnRequest.findMany({
    where: warehouse ? { fault: "FACTORY", status: { in: ["ACCEPTED", "PICKED_UP"] } } : {},
    select: returnSelect,
    orderBy: { createdAt: "desc" },
  });
}
export async function buyerReturns(buyerId: string, cartId: string) {
  const user = await activeUser(db, buyerId);
  if (user.role !== "CUSTOMER") throw new ReturnError("Buyer access required");
  return db.returnRequest.findMany({
    where: { buyerId, cartLine: { cartId } },
    select: returnSelect,
    orderBy: { createdAt: "desc" },
  });
}
const returnSelect = {
  id: true,
  cartLineId: true,
  qty: true,
  reason: true,
  fault: true,
  note: true,
  status: true,
  createdAt: true,
  adminDecision: true,
  adminNote: true,
  escalatedAt: true,
  receivedCondition: true,
  receivedAt: true,
  factoryNote: true,
  pickupRef: true,
  pickupDriver: true,
  paidBy: true,
  photos: { select: { id: true } },
  cartLine: {
    select: { variant: { select: { size: true, product: { select: { title: true } } } } },
  },
} as const;
