import "server-only";
import { distanceKm } from "@/lib/distance";
import { toD } from "@/lib/decimal";
import { itemCosts } from "@/lib/pack-money";
import { db, type Tx } from "./db";
import { AppError } from "./errors";
import { NEARBY_KM } from "./packs";

/**
 * At-cost resale of unopened items from a buyer's paid spot in a full basket. The price is what
 * the buyer paid for the unit within the basket (`itemCosts`) and is never edited. Payment happens
 * at pickup, outside the app. Lock order: PackMember row → ResaleListing row.
 */

const RESERVE_HOURS = 48;
export type Audience = "CONTACTS" | "NEARBY" | "BOTH";
const AUDIENCES: Audience[] = ["CONTACTS", "NEARBY", "BOTH"];
type Viewer = { id: string; phone: string | null; lat: number | null; lng: number | null };

/** Reservations that hold units: completed ones, and reserved ones not yet expired. */
const holding = (now: Date) => ({
  OR: [{ status: "COMPLETED" as const }, { status: "RESERVED" as const, expiresAt: { gt: now } }],
});
const sumQty = (rs: { qty: number }[]) => rs.reduce((a, r) => a + r.qty, 0);
const firstName = (name: string) => name.split(" ")[0];

/** Users who saved the viewer's number and whose number the viewer saved. */
async function mutualContacts(viewer: Viewer, tx: Tx = db): Promise<Set<string>> {
  if (!viewer.phone) return new Set();
  const mine = await tx.userContact.findMany({
    where: { userId: viewer.id },
    select: { phone: true },
  });
  const users = await tx.user.findMany({
    where: {
      phone: { in: mine.map((c) => c.phone) },
      contacts: { some: { phone: viewer.phone } },
    },
    select: { id: true },
  });
  return new Set(users.map((u) => u.id));
}

const isNear = (v: Viewer, l: { lat: number; lng: number }) =>
  v.lat != null && v.lng != null && distanceKm({ lat: v.lat, lng: v.lng }, l) <= NEARBY_KM;

/** Whether a viewer who is not the seller may see a listing under its audience. */
function audienceAllows(
  v: Viewer,
  l: { sellerId: string; audience: Audience; lat: number; lng: number },
  contacts: Set<string>,
) {
  return (
    (l.audience !== "NEARBY" && contacts.has(l.sellerId)) ||
    (l.audience !== "CONTACTS" && isNear(v, l))
  );
}

// ── Purchase history ─────────────────────────────────────────────────────────

/** The buyer's paid spots, newest first. */
export async function purchases(userId: string) {
  const rows = await db.packMember.findMany({
    where: { userId, status: "PAID" },
    orderBy: { paidAt: "desc" },
    select: {
      paidAt: true,
      group: {
        select: {
          id: true,
          status: true,
          size: true,
          price: true,
          version: {
            select: { pack: { select: { name: true, company: { select: { name: true } } } } },
          },
        },
      },
    },
  });
  return rows.map((m) => ({
    groupId: m.group.id,
    status: m.group.status,
    size: m.group.size,
    price: m.group.price,
    paidAt: m.paidAt,
    packName: m.group.version.pack.name,
    companyName: m.group.version.pack.company.name,
  }));
}

/** One paid basket with the items as bought, each with its cost and units left to resell. */
export async function purchase(userId: string, groupId: string) {
  const m = await db.packMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: {
      id: true,
      status: true,
      paidAt: true,
      listings: { select: { itemId: true, qty: true } },
      group: {
        select: {
          id: true,
          status: true,
          size: true,
          price: true,
          city: true,
          version: {
            select: {
              items: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  name: true,
                  size: true,
                  qty: true,
                  retailPrice: true,
                  photo: true,
                  chilled: true,
                },
              },
              pack: { select: { name: true, company: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!m || m.status !== "PAID") return null;
  const g = m.group;
  const costs = itemCosts(g.price, g.version.items);
  const ordered = g.status === "FULL";
  return {
    groupId: g.id,
    status: g.status,
    ordered,
    size: g.size,
    price: g.price,
    paidAt: m.paidAt,
    packName: g.version.pack.name,
    companyName: g.version.pack.company.name,
    items: g.version.items.map((it, i) => {
      const listed = sumQty(m.listings.filter((l) => l.itemId === it.id));
      const unitPrice = costs?.[i].unit ?? null;
      const left = it.qty - listed;
      return {
        id: it.id,
        name: it.name,
        size: it.size,
        photo: it.photo,
        qty: it.qty,
        left,
        unitPrice,
        chilled: it.chilled,
        resellable: ordered && !it.chilled && unitPrice !== null && left > 0,
      };
    }),
  };
}

// ── Listing ──────────────────────────────────────────────────────────────────

export type ListingInput = {
  groupId: string;
  itemId: string;
  qty: number;
  audience: string;
  spot: string;
  unopened: boolean;
};

/** Lists units from the seller's own paid spot in a full basket, at what the seller paid. */
export async function createListing(sellerId: string, input: ListingInput) {
  const spot = input.spot.trim();
  if (!input.unopened) throw new AppError("Confirm the items are unopened and in their packaging.");
  if (!AUDIENCES.includes(input.audience as Audience)) throw new AppError("Choose who can see it.");
  if (spot.length < 3 || spot.length > 120) throw new AppError("Name a public pickup spot.");
  if (!Number.isInteger(input.qty) || input.qty < 1) throw new AppError("Choose how many to sell.");
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT "id", "status"::text AS "status" FROM "PackMember"
      WHERE "groupId" = ${input.groupId} AND "userId" = ${sellerId}
      FOR UPDATE`;
    const member = rows[0];
    if (!member || member.status !== "PAID")
      throw new AppError("Only items from your own paid baskets can be resold.");
    const g = await tx.packGroup.findUniqueOrThrow({
      where: { id: input.groupId },
      select: {
        status: true,
        price: true,
        lat: true,
        lng: true,
        city: true,
        version: {
          select: {
            items: {
              orderBy: { sortOrder: "asc" },
              select: { id: true, qty: true, retailPrice: true, chilled: true },
            },
          },
        },
      },
    });
    if (g.status !== "FULL")
      throw new AppError("Items can be resold once the basket is full and ordered.");
    const items = g.version.items;
    const i = items.findIndex((it) => it.id === input.itemId);
    if (i < 0) throw new AppError("That item is not in this basket.");
    if (items[i].chilled) throw new AppError("Chilled and frozen items cannot be resold.");
    const cost = itemCosts(g.price, items)?.[i];
    if (!cost) throw new AppError("Original item price unavailable.");
    const listed = await tx.resaleListing.aggregate({
      where: { memberId: member.id, itemId: input.itemId },
      _sum: { qty: true },
    });
    const left = items[i].qty - (listed._sum.qty ?? 0);
    if (input.qty > left)
      throw new AppError(
        left > 0 ? `You have ${left} left to resell.` : "All of these are listed.",
      );
    return tx.resaleListing.create({
      data: {
        sellerId,
        memberId: member.id,
        itemId: input.itemId,
        qty: input.qty,
        unitPrice: cost.unit.toFixed(2),
        audience: input.audience as Audience,
        spot,
        city: g.city,
        lat: g.lat,
        lng: g.lng,
      },
      select: { id: true },
    });
  });
}

const listingSelect = (now: Date) =>
  ({
    id: true,
    sellerId: true,
    qty: true,
    unitPrice: true,
    audience: true,
    city: true,
    lat: true,
    lng: true,
    item: {
      select: {
        name: true,
        size: true,
        photo: true,
        retailPrice: true,
        version: { select: { pack: { select: { company: { select: { name: true } } } } } },
      },
    },
    reservations: { where: holding(now), select: { qty: true } },
  }) as const;

type ListingRow = {
  id: string;
  sellerId: string;
  qty: number;
  unitPrice: { toString(): string };
  city: string | null;
  item: {
    name: string;
    size: string;
    photo: string | null;
    retailPrice: { toString(): string } | null;
    version: { pack: { company: { name: string } } };
  };
  reservations: { qty: number }[];
};

/** Whole-percent saving of the resale price against the shop price, or null without one. */
function discountPct(unit: { toString(): string }, retail: { toString(): string } | null) {
  if (!retail) return null;
  const r = toD(retail);
  const pct = r.minus(toD(unit)).div(r).times(100).toDecimalPlaces(0);
  return pct.gt(0) ? pct.toString() : null;
}

const card = (l: ListingRow) => ({
  id: l.id,
  sellerId: l.sellerId,
  retailPrice: l.item.retailPrice,
  discountPct: discountPct(l.unitPrice, l.item.retailPrice),
  name: l.item.name,
  size: l.item.size,
  photo: l.item.photo,
  companyName: l.item.version.pack.company.name,
  available: l.qty - sumQty(l.reservations),
  unitPrice: l.unitPrice,
  city: l.city,
});

/**
 * Listings the viewer may reserve: mutual contacts' first, then others within 1 km of their
 * address pin; each group nearest first.
 */
export async function browseListings(viewer: Viewer) {
  const now = new Date();
  const contacts = await mutualContacts(viewer);
  const pin =
    viewer.lat != null && viewer.lng != null ? { lat: viewer.lat, lng: viewer.lng } : null;
  const dLat = 0.0095;
  const dLng = pin ? dLat / Math.max(0.1, Math.cos((pin.lat * Math.PI) / 180)) : 0;
  const held = { buyerId: viewer.id, status: "RESERVED" as const, expiresAt: { gt: now } };
  const rows = await db.resaleListing.findMany({
    where: {
      cancelledAt: null,
      sellerId: { not: viewer.id },
      OR: [
        { reservations: { some: held } },
        { sellerId: { in: [...contacts] }, audience: { in: ["CONTACTS", "BOTH"] } },
        ...(pin
          ? [
              {
                audience: { in: ["NEARBY", "BOTH"] as Audience[] },
                lat: { gte: pin.lat - dLat, lte: pin.lat + dLat },
                lng: { gte: pin.lng - dLng, lte: pin.lng + dLng },
              },
            ]
          : []),
      ],
    },
    select: {
      ...listingSelect(now),
      spot: true,
      seller: { select: { name: true } },
      reservations: {
        where: holding(now),
        select: { id: true, qty: true, buyerId: true, status: true, expiresAt: true },
      },
    },
  });
  return rows
    .map((l) => ({ ...l, mine: l.reservations.filter((r) => r.buyerId === viewer.id) }))
    .filter((l) => l.mine.length > 0 || audienceAllows(viewer, l, contacts))
    .map((l) => ({
      ...card(l),
      sellerName: firstName(l.seller.name),
      contact: l.audience !== "NEARBY" && contacts.has(l.sellerId),
      distanceKm: pin ? distanceKm(pin, l) : null,
      // The pickup spot only once the viewer holds a reservation.
      spot: l.mine.length > 0 ? l.spot : null,
      mine: l.mine
        .filter((r) => r.status === "RESERVED")
        .map((r) => ({ id: r.id, qty: r.qty, expiresAt: r.expiresAt })),
    }))
    .filter((l) => l.available > 0 || l.mine.length > 0)
    .sort(
      (a, b) =>
        (a.contact === b.contact ? 0 : a.contact ? -1 : 1) ||
        (a.distanceKm ?? 0) - (b.distanceKm ?? 0),
    );
}

/** A reserved reservation past its time reads as expired before the sweep marks it. */
function shownStatus(r: { status: string; expiresAt: Date }, now: Date) {
  return r.status === "RESERVED" && r.expiresAt <= now ? "EXPIRED" : r.status;
}

async function lockListing(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT 1 FROM "ResaleListing" WHERE "id" = ${id} FOR UPDATE`;
}

// ── Reservations ─────────────────────────────────────────────────────────────

/** Reserves units for pickup. Never more than are free, never the buyer's own listing. */
export async function reserve(buyerId: string, listingId: string, qty: number) {
  if (!Number.isInteger(qty) || qty < 1) throw new AppError("Choose how many to reserve.");
  return db.$transaction(async (tx) => {
    await lockListing(tx, listingId);
    const now = new Date();
    const l = await tx.resaleListing.findUnique({
      where: { id: listingId },
      select: {
        sellerId: true,
        audience: true,
        lat: true,
        lng: true,
        qty: true,
        cancelledAt: true,
        reservations: { where: holding(now), select: { qty: true } },
      },
    });
    const viewer = await tx.user.findUniqueOrThrow({
      where: { id: buyerId },
      select: { id: true, phone: true, lat: true, lng: true },
    });
    if (!l || l.cancelledAt || !audienceAllows(viewer, l, await mutualContacts(viewer, tx))) {
      if (l?.sellerId === buyerId) throw new AppError("You cannot reserve your own listing.");
      throw new AppError("This listing is not available to you.");
    }
    if (l.sellerId === buyerId) throw new AppError("You cannot reserve your own listing.");
    const free = l.qty - sumQty(l.reservations);
    if (qty > free) throw new AppError(free > 0 ? `Only ${free} left.` : "None left.");
    return tx.resaleReservation.create({
      data: {
        listingId,
        buyerId,
        qty,
        expiresAt: new Date(now.getTime() + RESERVE_HOURS * 3_600_000),
      },
      select: { id: true },
    });
  });
}

async function reservationFor(tx: Tx, id: string) {
  const r = await tx.resaleReservation.findUnique({
    where: { id },
    select: { listingId: true },
  });
  if (!r) throw new AppError("Reservation not found.");
  await lockListing(tx, r.listingId);
  return tx.resaleReservation.findUniqueOrThrow({
    where: { id },
    select: {
      status: true,
      expiresAt: true,
      buyerId: true,
      listing: { select: { sellerId: true } },
    },
  });
}

/** The seller confirms the buyer collected and paid; the units are gone for good. */
export async function completeReservation(sellerId: string, id: string) {
  await db.$transaction(async (tx) => {
    const r = await reservationFor(tx, id);
    if (r.listing.sellerId !== sellerId) throw new AppError("Reservation not found.");
    if (r.status !== "RESERVED" || r.expiresAt <= new Date())
      throw new AppError("This reservation is no longer open.");
    await tx.resaleReservation.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  });
}

/** Either side cancels a reservation not yet completed; its units are free again. */
export async function cancelReservation(userId: string, id: string) {
  await db.$transaction(async (tx) => {
    const r = await reservationFor(tx, id);
    if (r.buyerId !== userId && r.listing.sellerId !== userId)
      throw new AppError("Reservation not found.");
    if (r.status !== "RESERVED") throw new AppError("This reservation is no longer open.");
    await tx.resaleReservation.update({ where: { id }, data: { status: "CANCELLED" } });
  });
}

/** The seller withdraws a listing: open reservations are cancelled, handed-over units stay sold. */
export async function cancelListing(sellerId: string, id: string) {
  await db.$transaction(async (tx) => {
    await lockListing(tx, id);
    const l = await tx.resaleListing.findUnique({
      where: { id },
      select: {
        sellerId: true,
        cancelledAt: true,
        reservations: { where: { status: "COMPLETED" }, select: { qty: true } },
      },
    });
    if (!l || l.sellerId !== sellerId) throw new AppError("Listing not found.");
    if (l.cancelledAt) return;
    await tx.resaleReservation.updateMany({
      where: { listingId: id, status: "RESERVED" },
      data: { status: "CANCELLED" },
    });
    await tx.resaleListing.update({
      where: { id },
      data: { cancelledAt: new Date(), qty: sumQty(l.reservations) },
    });
  });
}

/** Daily sweep: marks lapsed reservations expired (they stopped holding units at `expiresAt`). */
export async function expireReservations(now: Date): Promise<number> {
  const r = await db.resaleReservation.updateMany({
    where: { status: "RESERVED", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  return r.count;
}

// ── My listings and reservations ─────────────────────────────────────────────

export async function myResale(userId: string) {
  const now = new Date();
  const item = {
    select: {
      name: true,
      size: true,
      version: { select: { pack: { select: { company: { select: { name: true } } } } } },
    },
  } as const;
  const [listings, reservations] = await Promise.all([
    db.resaleListing.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        qty: true,
        unitPrice: true,
        spot: true,
        cancelledAt: true,
        item,
        reservations: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            qty: true,
            status: true,
            expiresAt: true,
            buyer: { select: { name: true } },
          },
        },
      },
    }),
    db.resaleReservation.findMany({
      where: { buyerId: userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        qty: true,
        status: true,
        expiresAt: true,
        listing: {
          select: {
            id: true,
            unitPrice: true,
            spot: true,
            item,
            seller: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  return {
    listings: listings.map((l) => {
      const rs = l.reservations.map((r) => ({
        id: r.id,
        qty: r.qty,
        expiresAt: r.expiresAt,
        status: shownStatus(r, now),
        buyerName: firstName(r.buyer.name),
      }));
      const count = (s: string) => sumQty(rs.filter((r) => r.status === s));
      const completed = count("COMPLETED");
      const reserved = count("RESERVED");
      return {
        id: l.id,
        name: l.item.name,
        size: l.item.size,
        companyName: l.item.version.pack.company.name,
        unitPrice: l.unitPrice,
        spot: l.spot,
        cancelled: !!l.cancelledAt,
        available: l.cancelledAt ? 0 : l.qty - completed - reserved,
        reserved,
        completed,
        reservations: rs,
      };
    }),
    reservations: reservations.map((r) => {
      const status = shownStatus(r, now);
      return {
        id: r.id,
        qty: r.qty,
        status,
        expiresAt: r.expiresAt,
        name: r.listing.item.name,
        size: r.listing.item.size,
        companyName: r.listing.item.version.pack.company.name,
        unitPrice: r.listing.unitPrice,
        sellerName: firstName(r.listing.seller.name),
        spot: status === "RESERVED" || status === "COMPLETED" ? r.listing.spot : null,
      };
    }),
  };
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export async function listContacts(userId: string) {
  return db.userContact.findMany({
    where: { userId },
    orderBy: { phone: "asc" },
    select: { phone: true },
  });
}

export async function addContact(userId: string, phone: string) {
  await db.userContact.upsert({
    where: { userId_phone: { userId, phone } },
    create: { userId, phone },
    update: {},
  });
}

export async function removeContact(userId: string, phone: string) {
  await db.userContact.deleteMany({ where: { userId, phone } });
}
