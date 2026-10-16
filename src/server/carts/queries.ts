import "server-only";
import { db } from "../db";

/**
 * The public "open carts" panel: public carts still taking members, newest first. A signed-in
 * user's own carts (owned or joined) are left out; they are under "My carts".
 */
export async function recentCarts(take = 12, now = new Date(), userId?: string) {
  return db.groupCart.findMany({
    where: {
      visibility: "PUBLIC",
      status: { in: ["OPEN", "READY"] },
      expiresAt: { gt: now },
      ...(userId ? { ownerId: { not: userId }, members: { none: { userId } } } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      total: true,
      minOrderValue: true,
      expiresAt: true,
      createdAt: true,
      owner: { select: { name: true, city: true } },
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export type PanelCart = Awaited<ReturnType<typeof recentCarts>>[number];

export async function cartByCode(code: string) {
  return db.groupCart.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      owner: { select: { id: true, name: true, city: true } },
      members: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { joinedAt: "asc" },
      },
      lines: {
        include: {
          variant: {
            select: {
              id: true,
              size: true,
              colour: true,
              available: true,
              product: { select: { id: true, title: true, brand: true, stockType: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      slips: { orderBy: { createdAt: "desc" }, take: 1 },
      delivery: true,
    },
  });
}

export type FullCart = NonNullable<Awaited<ReturnType<typeof cartByCode>>>;

/** Carts the user can still add to, for the product page's "add to which cart" choice. */
export async function editableCartsFor(userId: string, now = new Date()) {
  return db.groupCart.findMany({
    where: {
      members: { some: { userId } },
      status: { in: ["OPEN", "READY"] },
      expiresAt: { gt: now },
    },
    select: { id: true, code: true, name: true, total: true, minOrderValue: true },
    orderBy: { createdAt: "desc" },
  });
}

/** A cart by share code that anyone with the code can still join. */
export async function joinableCart(code: string, now = new Date()) {
  return db.groupCart.findFirst({
    where: { code: code.toUpperCase(), status: { in: ["OPEN", "READY"] }, expiresAt: { gt: now } },
    select: { id: true, code: true, name: true, total: true, minOrderValue: true },
  });
}

export async function myCarts(userId: string) {
  return db.groupCart.findMany({
    where: { members: { some: { userId } } },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      total: true,
      minOrderValue: true,
      expiresAt: true,
      slipDueAt: true,
      ownerId: true,
      _count: { select: { members: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}

/**
 * Everything on a buyer's dashboard: their carts (with their own lines, for their share), the
 * owner's latest slip and the delivery, open invites, and the latest notices.
 */
export async function buyerDashboard(userId: string, now = new Date()) {
  const [memberships, invites, notices] = await Promise.all([
    db.cartMember.findMany({
      where: { userId },
      select: {
        cart: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            total: true,
            minOrderValue: true,
            expiresAt: true,
            slipDueAt: true,
            confirmedAt: true,
            closedReason: true,
            ownerId: true,
            updatedAt: true,
            owner: { select: { name: true, phone: true } },
            lines: { where: { userId }, select: { qty: true, unitPrice: true } },
            slips: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { status: true, reviewNote: true },
            },
            delivery: { select: { status: true, trackingUrl: true, quotedFee: true } },
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { cart: { updatedAt: "desc" } },
      take: 50,
    }),
    db.cartInvite.findMany({
      where: {
        invitedUserId: userId,
        cart: {
          status: { in: ["OPEN", "READY"] },
          expiresAt: { gt: now },
          members: { none: { userId } },
        },
      },
      select: {
        id: true,
        invitedBy: { select: { name: true } },
        cart: { select: { code: true, name: true, total: true, minOrderValue: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  return { carts: memberships.map((m) => m.cart), invites, notices };
}

/** The user's one active cart, if any (same test as `assertOneCart` in service.ts). */
export async function activeCartOf(userId: string, now = new Date()) {
  return db.groupCart.findFirst({
    where: {
      members: { some: { userId } },
      OR: [
        { status: { in: ["OPEN", "READY"] }, expiresAt: { gt: now } },
        { status: "AWAITING_SLIP", slipDueAt: { gt: now } },
        { status: "SLIP_REVIEW" },
      ],
    },
    select: { id: true, code: true, name: true },
  });
}
