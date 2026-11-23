import "server-only";
import { randomUUID } from "node:crypto";
import { appUrl } from "@/lib/app-url";
import { distanceKm } from "@/lib/distance";
import { isBasketSize, packAmountDue, sizePrice } from "@/lib/pack-money";
import { db, type Tx } from "./db";
import { AppError } from "./errors";
import { getGateway } from "./payments/gateway";
import { NEARBY_KM } from "./packs";
import { getSettings } from "./settings";

/**
 * Joining a basket (DEC-030). Lock order: PaymentAttempt row → PackGroup row. A spot is held
 * while its payment is pending and counts toward `joined`, so a basket is never overfilled.
 */

const DAY = 86_400_000;

type LockedGroup = {
  id: string;
  status: "PENDING" | "OPEN" | "FULL" | "CLOSED";
  joined: number;
  closesAt: Date;
  lat: number;
  lng: number;
  size: number;
  price: string;
};

export async function lockGroup(tx: Tx, groupId: string): Promise<LockedGroup | null> {
  const rows = await tx.$queryRaw<LockedGroup[]>`
    SELECT g."id", g."status"::text AS "status", g."joined", g."closesAt", g."lat", g."lng",
           g."size", g."price"::text AS "price"
    FROM "PackGroup" g
    WHERE g."id" = ${groupId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

export async function lockAttempt(tx: Tx, attemptId: string) {
  await tx.$queryRaw`SELECT 1 FROM "PaymentAttempt" WHERE "id" = ${attemptId} FOR UPDATE`;
}

/** Holds a spot and opens a payment attempt for it. Caller holds the group row. */
async function holdSpot(tx: Tx, userId: string, g: LockedGroup) {
  const existing = await tx.packMember.findUnique({
    where: { groupId_userId: { groupId: g.id, userId } },
    select: { status: true },
  });
  if (existing?.status === "PAID") throw new AppError("You are already in this basket.");
  if (existing) throw new AppError("Your payment for this basket is still open.");
  if (g.joined >= g.size) throw new AppError("This basket is full.");
  const { paymentHoldMinutes } = await getSettings(tx);
  const heldUntil = new Date(Date.now() + paymentHoldMinutes * 60_000);
  const member = await tx.packMember.create({
    data: { groupId: g.id, userId, status: "HELD", heldUntil },
    select: { id: true },
  });
  await tx.packGroup.update({ where: { id: g.id }, data: { joined: { increment: 1 } } });
  const attempt = await tx.paymentAttempt.create({
    data: {
      buyerId: userId,
      packMemberId: member.id,
      amount: g.price,
      gatewayRef: `ga_${randomUUID()}`,
      expiresAt: heldUntil,
    },
    select: { id: true },
  });
  return { attemptId: attempt.id, amount: g.price };
}

async function buyer(userId: string) {
  const u = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, lat: true, lng: true, address: true, city: true },
  });
  if (u.lat == null || u.lng == null || !u.address)
    throw new AppError("Set your address pin first.");
  return u as typeof u & { lat: number; lng: number; address: string };
}

/** Pay to join an open basket within 1 km. Returns the gateway redirect. */
export async function joinBasket(userId: string, groupId: string) {
  const u = await buyer(userId);
  const pay = await db.$transaction(async (tx) => {
    const g = await lockGroup(tx, groupId);
    if (!g || g.status !== "OPEN" || g.closesAt <= new Date())
      throw new AppError("This basket is no longer taking families.");
    if (distanceKm(u, g) > NEARBY_KM) throw new AppError("This basket is more than 1 km away.");
    return holdSpot(tx, userId, g);
  });
  return checkout(u, pay);
}

/** Pay to start a basket of 5, 10 or 15 families for a pack; the payer becomes its owner. */
export async function startBasket(userId: string, versionId: string, size: number) {
  if (!isBasketSize(size)) throw new AppError("Choose 5, 10 or 15 families.");
  const u = await buyer(userId);
  const pay = await db.$transaction(async (tx) => {
    const v = await tx.packVersion.findUnique({
      where: { id: versionId },
      select: {
        publishedAt: true,
        pricePerFamily: true,
        discount5: true,
        discount10: true,
        discount15: true,
        pack: { select: { active: true, durationDays: true } },
      },
    });
    if (!v?.publishedAt || !v.pack.active) throw new AppError("This pack is not available.");
    const group = await tx.packGroup.create({
      data: {
        versionId,
        size,
        price: sizePrice(v, size).toFixed(2),
        createdById: userId,
        lat: u.lat,
        lng: u.lng,
        address: u.address,
        city: u.city,
        closesAt: new Date(Date.now() + v.pack.durationDays * DAY),
      },
      select: { id: true },
    });
    const g = await lockGroup(tx, group.id);
    return holdSpot(tx, userId, g!);
  });
  return checkout(u, pay);
}

async function checkout(
  u: { id: string; name: string; email: string },
  pay: { attemptId: string; amount: string },
) {
  return getGateway().createCheckout({
    attemptId: pay.attemptId,
    amount: pay.amount,
    currency: "LKR",
    returnUrl: appUrl(`/baskets/return/${pay.attemptId}`),
    notifyUrl: appUrl("/api/payments/notify"),
    buyer: u,
  });
}

/** A verified payment for a spot. Caller holds the attempt row. False when the spot is gone
 * (released, or the basket full or closed): the caller gives the money back as tokens. */
export async function confirmPackSpot(
  tx: Tx,
  attemptId: string,
  now = new Date(),
): Promise<boolean> {
  const a = await tx.paymentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { packMember: { select: { id: true, groupId: true, status: true } } },
  });
  const m = a.packMember;
  if (!m) return false;
  const g = await lockGroup(tx, m.groupId);
  if (!g || g.status === "CLOSED" || g.status === "FULL" || m.status !== "HELD") return false;
  await tx.packMember.update({
    where: { id: m.id },
    data: { status: "PAID", heldUntil: null, paidAt: now },
  });
  const paid = await tx.packMember.count({ where: { groupId: g.id, status: "PAID" } });
  if (g.status === "PENDING") {
    await tx.packGroup.update({ where: { id: g.id }, data: { status: "OPEN" } });
  }
  if (paid >= g.size) await fillBasket(tx, g.id, now);
  return true;
}

/** The last spot is paid: the basket is FULL and its order goes to the company. */
async function fillBasket(tx: Tx, groupId: string, now: Date) {
  const g = await tx.packGroup.update({
    where: { id: groupId },
    data: { status: "FULL" },
    select: {
      joined: true,
      price: true,
      version: {
        select: {
          commissionPct: true,
          pack: { select: { companyId: true } },
        },
      },
    },
  });
  await tx.packDelivery.create({
    data: {
      groupId,
      companyId: g.version.pack.companyId,
      families: g.joined,
      amountDue: packAmountDue(g.price, g.version.commissionPct, g.joined).toFixed(2),
      createdAt: now,
    },
  });
}

/** A failed, cancelled or expired payment frees its spot. Caller holds the attempt row. */
export async function releasePackSpot(tx: Tx, attemptId: string): Promise<void> {
  const a = await tx.paymentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { packMember: { select: { id: true, groupId: true, status: true } } },
  });
  const m = a.packMember;
  if (!m || m.status !== "HELD") return;
  const g = await lockGroup(tx, m.groupId);
  if (!g) return;
  await tx.packMember.delete({ where: { id: m.id } });
  if (g.status === "PENDING") {
    // The owner never paid: the basket never opened.
    await tx.packGroup.delete({ where: { id: g.id } });
    return;
  }
  await tx.packGroup.update({ where: { id: g.id }, data: { joined: { decrement: 1 } } });
}
