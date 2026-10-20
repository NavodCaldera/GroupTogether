import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { type OrderStage, orderStage } from "@/lib/packing-rules";
import { db } from "./db";
import { packingSelect } from "./packing";

/**
 * The admin's Orders tab (product owner, 2026-10-21): every paid order from payment to delivery,
 * in one place. Booking PickMe and the delivery buttons live only there.
 */
const orderSelect = {
  id: true,
  code: true,
  confirmedAt: true,
  deliveryAddress: true,
  deliveryCity: true,
  deliveryPhone: true,
  owner: { select: { name: true } },
  lines: { select: { qty: true } },
  delivery: {
    select: {
      id: true,
      status: true,
      externalRef: true,
      quotedFee: true,
      trackingUrl: true,
      driverName: true,
      updatedAt: true,
    },
  },
  packing: { select: packingSelect },
} satisfies Prisma.GroupCartSelect;

/** Paid orders by stage, oldest first; the last 20 delivered, newest first. */
export async function ordersBoard() {
  const [open, delivered] = await Promise.all([
    db.groupCart.findMany({
      where: { status: { in: ["CONFIRMED", "DISPATCHED"] } },
      select: orderSelect,
      orderBy: { confirmedAt: "asc" },
    }),
    db.groupCart.findMany({
      where: { status: "DELIVERED" },
      select: orderSelect,
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);
  const rows = [...open, ...delivered].map((c) => ({
    ...c,
    items: c.lines.reduce((n, l) => n + l.qty, 0),
    stage: orderStage(c.delivery, c.packing),
  }));
  const by = (s: OrderStage) => rows.filter((r) => r.stage === s);
  return {
    "to-book": by("to-book"),
    "in-store": by("in-store"),
    "on-the-way": by("on-the-way"),
    failed: by("failed"),
    delivered: by("delivered"),
  } satisfies Record<OrderStage, unknown>;
}

export type OrderRow = Awaited<ReturnType<typeof ordersBoard>>["to-book"][number];
