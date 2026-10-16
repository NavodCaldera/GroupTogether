import "server-only";
import { db } from "../db";

/** The public "recent carts" panel: public carts still taking members, newest first. */
export async function recentCarts(take = 12, now = new Date()) {
  return db.groupCart.findMany({
    where: { visibility: "PUBLIC", status: { in: ["OPEN", "READY"] }, expiresAt: { gt: now } },
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
