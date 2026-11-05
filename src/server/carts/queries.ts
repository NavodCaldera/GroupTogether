import "server-only";
import { type Point, distanceKm, sortNearest } from "@/lib/distance";
import { db } from "../db";

/**
 * The public "open carts" panel: public carts still taking members. A signed-in user's own carts
 * (owned or joined) are left out; they are under "My carts". With `near` (the buyer's map pin)
 * the nearest delivery point comes first; otherwise newest first. `q` searches the cart name,
 * its code and the owner's name.
 */
export async function recentCarts(
  take = 12,
  now = new Date(),
  userId?: string,
  { q, near }: { q?: string; near?: Point | null } = {},
) {
  const term = q?.trim();
  const rows = await db.groupCart.findMany({
    where: {
      visibility: "PUBLIC",
      status: { in: ["OPEN", "READY"] },
      expiresAt: { gt: now },
      ...(userId ? { ownerId: { not: userId }, members: { none: { userId } } } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { code: { contains: term, mode: "insensitive" } },
              { owner: { name: { contains: term, mode: "insensitive" } } },
            ],
          }
        : {}),
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
      deliveryLat: true,
      deliveryLng: true,
      owner: { select: { name: true, city: true, lat: true, lng: true } },
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: "desc" },
    // Sorting by distance happens here, so look at more than we show.
    take: near ? Math.max(take, 300) : take,
  });
  const carts = rows.map(({ deliveryLat, deliveryLng, ...c }) => {
    // The drop-off pin once the owner has accepted; until then the owner's own pin.
    const pin =
      deliveryLat !== null && deliveryLng !== null
        ? { lat: deliveryLat, lng: deliveryLng }
        : c.owner.lat !== null && c.owner.lng !== null
          ? { lat: c.owner.lat, lng: c.owner.lng }
          : null;
    return { ...c, distanceKm: near && pin ? distanceKm(near, pin) : null };
  });
  return (near ? sortNearest(carts) : carts).slice(0, take);
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

/** A buyer's finished carts (orders and closed ones), newest first, with their own lines. */
export async function myCarts(userId: string) {
  return db.groupCart.findMany({
    where: {
      members: { some: { userId } },
      status: { in: ["CONFIRMED", "DISPATCHED", "DELIVERED", "EXPIRED", "CANCELLED"] },
    },
    select: {
      id: true,
      code: true,
      status: true,
      total: true,
      ownerId: true,
      createdAt: true,
      confirmedAt: true,
      owner: { select: { name: true } },
      lines: { where: { userId }, select: { qty: true, unitPrice: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

/**
 * Everything on a buyer's dashboard: their carts (with their own lines, for their share), the
 * owner's latest slip and the delivery, and open invites.
 */
export async function buyerDashboard(userId: string, now = new Date()) {
  const [memberships, invites] = await Promise.all([
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
            lines: {
              where: { userId },
              select: { qty: true, unitPrice: true, tokensApplied: true },
            },
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
  ]);
  const held = await db.cartLine.groupBy({
    by: ["cartId"],
    where: { cartId: { in: memberships.map((m) => m.cart.id) } },
    _sum: { tokensApplied: true },
  });
  const totals = new Map(held.map((row) => [row.cartId, row._sum.tokensApplied]));
  return {
    carts: memberships.map((m) => ({
      ...m.cart,
      tokensApplied: totals.get(m.cart.id)?.toString() ?? "0",
    })),
    invites,
  };
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

/** Pending requests to join a cart, with what the requester would bring. */
export async function mergeRequestsFor(cartId: string) {
  const reqs = await db.cartMergeRequest.findMany({
    where: { toCartId: cartId, status: "PENDING", fromCartId: { not: null } },
    include: {
      user: { select: { id: true, name: true } },
      fromCart: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const lines = await mergeRequestLines(reqs);
  return reqs.map((r) => ({ ...r, lines: lines.get(r.id) ?? [] }));
}

/** Lines each requester would bring from their own cart, loaded in one query. */
export async function mergeRequestLines(
  reqs: { id: string; fromCartId: string | null; userId: string }[],
) {
  const wanted = reqs.filter((r) => r.fromCartId);
  const rows = wanted.length
    ? await db.cartLine.findMany({
        where: { OR: wanted.map((r) => ({ cartId: r.fromCartId!, userId: r.userId })) },
        select: { cartId: true, userId: true, qty: true, unitPrice: true },
      })
    : [];
  const out = new Map<string, Pick<(typeof rows)[number], "qty" | "unitPrice">[]>();
  for (const r of wanted)
    out.set(
      r.id,
      rows
        .filter((l) => l.cartId === r.fromCartId && l.userId === r.userId)
        .map(({ qty, unitPrice }) => ({ qty, unitPrice })),
    );
  return out;
}

/** The signed-in user's waiting request to join this cart, if any. */
export async function myMergeRequest(userId: string, toCartId: string) {
  return db.cartMergeRequest.findFirst({ where: { userId, toCartId, status: "PENDING" } });
}

/** The user's active cart with what a merge needs to know about it. */
export async function activeCartDetail(userId: string, now = new Date()) {
  return db.groupCart.findFirst({
    where: {
      members: { some: { userId } },
      OR: [
        { status: { in: ["OPEN", "READY"] }, expiresAt: { gt: now } },
        { status: "AWAITING_SLIP", slipDueAt: { gt: now } },
        { status: "SLIP_REVIEW" },
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      expiresAt: true,
      ownerId: true,
      _count: { select: { members: true } },
    },
  });
}
