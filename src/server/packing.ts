import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { PACKABLE, handOverBlockReason, packBlockReason, packingStage } from "@/lib/packing-rules";
import { colomboDayStart } from "@/lib/format";
import { CartError } from "./carts/service";
import { db } from "./db";
import { notify } from "./notify";

/**
 * Packing staff (role PACKER, created by an admin) prepare confirmed carts in our store
 * (CLAUDE.md rule 17, product owner 2026-10-19): one person checks every item and gathers it all
 * together, then a different person rechecks it and packs it, and only then is it handed to the
 * PickMe driver, which marks the drop picked up. Who did each step is kept and shown to the
 * admin. Each step locks the cart row, like every other cart change.
 */

/** Who gathered, packed and handed over: for the packing pages and the admin. */
export const packingSelect = {
  gatheredById: true,
  gatheredAt: true,
  packedById: true,
  packedAt: true,
  handedOverAt: true,
  gatheredBy: { select: { id: true, name: true } },
  packedBy: { select: { id: true, name: true } },
  handedOverBy: { select: { id: true, name: true } },
} satisfies Prisma.PackingSelect;

export type PackingView = Prisma.PackingGetPayload<{ select: typeof packingSelect }>;

async function lockedCart(tx: Prisma.TransactionClient, cartId: string) {
  await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${cartId} FOR UPDATE`;
  const cart = await tx.groupCart.findUnique({
    where: { id: cartId },
    include: { packing: true, delivery: true },
  });
  if (!cart) throw new CartError("This order no longer exists");
  if (!PACKABLE.includes(cart.status)) throw new CartError("This order isn't waiting to be packed");
  return cart;
}

/** First check: every item is here and gathered together. */
export async function markGathered(staffId: string, cartId: string, now = new Date()) {
  await db.$transaction(async (tx) => {
    const cart = await lockedCart(tx, cartId);
    if (cart.packing) throw new CartError("Already gathered");
    await tx.packing.create({ data: { cartId, gatheredById: staffId, gatheredAt: now } });
  });
}

/** Second check, by someone else: rechecked every item, then packed it. */
export async function markPacked(staffId: string, cartId: string, now = new Date()) {
  await db.$transaction(async (tx) => {
    const cart = await lockedCart(tx, cartId);
    const reason = packBlockReason(cart.packing, staffId);
    if (reason) throw new CartError(reason);
    await tx.packing.update({
      where: { id: cart.packing!.id },
      data: { packedById: staffId, packedAt: now },
    });
  });
}

/** Something was wrong before packing: the gathering is cleared, and it starts again. */
export async function sendBack(cartId: string) {
  await db.$transaction(async (tx) => {
    const cart = await lockedCart(tx, cartId);
    if (!cart.packing) throw new CartError("This order isn't gathered yet");
    if (cart.packing.handedOverAt) throw new CartError("This order has already gone to PickMe");
    // Once packed it can't be sent back (product owner, 2026-10-20).
    if (cart.packing.packedAt) throw new CartError("This order is already packed");
    await tx.packing.delete({ where: { id: cart.packing.id } });
  });
}

/** The packed parcel goes to the PickMe driver: the drop is now picked up. */
export async function handOver(staffId: string, cartId: string, now = new Date()) {
  const cart = await db.$transaction(async (tx) => {
    const cart = await lockedCart(tx, cartId);
    const reason = handOverBlockReason(cart.packing, cart.delivery);
    if (reason) throw new CartError(reason);
    await tx.packing.update({
      where: { id: cart.packing!.id },
      data: { handedOverById: staffId, handedOverAt: now },
    });
    if (cart.delivery!.status === "BOOKED")
      await tx.delivery.update({ where: { id: cart.delivery!.id }, data: { status: "PICKED_UP" } });
    return cart;
  });
  await notify([cart.ownerId], {
    title: "Your order is with the PickMe driver",
    body: "We checked and packed your order and handed it to the PickMe driver. Pay the delivery fee to the driver when it arrives.",
    href: `/c/${cart.code}`,
  });
}

const queueSelect = {
  id: true,
  code: true,
  confirmedAt: true,
  deliveryCity: true,
  owner: { select: { name: true } },
  lines: { where: { status: "ACTIVE" }, select: { qty: true } },
  delivery: { select: { status: true, externalRef: true, driverName: true } },
  packing: { select: packingSelect },
} satisfies Prisma.GroupCartSelect;

/** The packing list: confirmed orders not yet handed over (oldest first), plus today's handovers. */
export async function packingQueue(now = new Date()) {
  const [open, handed] = await Promise.all([
    db.groupCart.findMany({
      where: {
        status: { in: [...PACKABLE] },
        OR: [{ packing: { is: null } }, { packing: { is: { handedOverAt: null } } }],
      },
      select: queueSelect,
      orderBy: { confirmedAt: "asc" },
    }),
    db.groupCart.findMany({
      where: { packing: { is: { handedOverAt: { gte: colomboDayStart(now) } } } },
      select: queueSelect,
      orderBy: { packing: { handedOverAt: "desc" } },
    }),
  ]);
  const rows = open.map((c) => ({
    ...c,
    items: c.lines.reduce((n, l) => n + l.qty, 0),
    stage: packingStage(c.packing),
  }));
  return {
    toGather: rows.filter((c) => c.stage === "to-gather"),
    toPack: rows.filter((c) => c.stage === "to-pack"),
    ready: rows.filter((c) => c.stage === "ready"),
    handedToday: handed.map((c) => ({ ...c, items: c.lines.reduce((n, l) => n + l.qty, 0) })),
  };
}

export type QueueCart = Awaited<ReturnType<typeof packingQueue>>["handedToday"][number];

/** One order for the packing page: the parcel's contents by member, and the drop-off label. */
export async function packingOrder(code: string) {
  return db.groupCart.findUnique({
    where: { code: code.toUpperCase() },
    select: {
      id: true,
      code: true,
      status: true,
      ownerId: true,
      confirmedAt: true,
      deliveryAddress: true,
      deliveryCity: true,
      deliveryPhone: true,
      owner: { select: { name: true } },
      members: {
        select: { userId: true, user: { select: { name: true } } },
        orderBy: { joinedAt: "asc" },
      },
      lines: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          userId: true,
          qty: true,
          variant: {
            select: {
              size: true,
              colour: true,
              product: { select: { brand: true, title: true } },
            },
          },
        },
        orderBy: { variant: { product: { title: "asc" } } },
      },
      delivery: { select: { status: true, externalRef: true, driverName: true } },
      packing: { select: packingSelect },
    },
  });
}

/** What one packer did today (Colombo day), for their profile page. */
export async function packerToday(staffId: string, now = new Date()) {
  const since = colomboDayStart(now);
  const [gathered, packed, handedOver] = await Promise.all([
    db.packing.count({ where: { gatheredById: staffId, gatheredAt: { gte: since } } }),
    db.packing.count({ where: { packedById: staffId, packedAt: { gte: since } } }),
    db.packing.count({ where: { handedOverById: staffId, handedOverAt: { gte: since } } }),
  ]);
  return { gathered, packed, handedOver };
}
