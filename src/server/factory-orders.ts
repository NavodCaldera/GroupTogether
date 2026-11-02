import "server-only";
import { CartError } from "./carts/service";
import { db } from "./db";
import { notifyRole } from "./notify";

/**
 * Factory-direct fulfilment (product owner, 2026-11-03): each factory packs its own paid orders,
 * then the admin books PickMe from the factory and we track the drop until it is delivered.
 * A cart holds one factory's products, so the factory is the seller of any of its lines.
 */
const ofFactory = (factoryId: string) => ({
  lines: { some: { variant: { product: { sellerId: factoryId } } } },
});

/** The factory's paid orders: still to pack and on their way first, then the last delivered. */
export async function factoryOrders(factoryId: string) {
  const select = {
    id: true,
    code: true,
    status: true,
    confirmedAt: true,
    factoryPackedAt: true,
    deliveryCity: true,
    lines: {
      select: {
        qty: true,
        variant: { select: { size: true, colour: true, product: { select: { title: true } } } },
      },
      orderBy: { variantId: "asc" as const },
    },
    delivery: {
      select: { status: true, driverName: true, trackingUrl: true, externalRef: true },
    },
  };
  const [open, delivered] = await Promise.all([
    db.groupCart.findMany({
      where: { status: { in: ["CONFIRMED", "DISPATCHED"] }, ...ofFactory(factoryId) },
      select,
      orderBy: { confirmedAt: "asc" },
    }),
    db.groupCart.findMany({
      where: { status: "DELIVERED", ...ofFactory(factoryId) },
      select,
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);
  return [...open, ...delivered];
}

/** The factory says the parcel is packed and ready for the PickMe driver. */
export async function markFactoryPacked(factoryId: string, cartId: string, now = new Date()) {
  const cart = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${cartId} FOR UPDATE`;
    const c = await tx.groupCart.findFirst({
      where: { id: cartId, ...ofFactory(factoryId) },
      select: { code: true, status: true, factoryPackedAt: true },
    });
    if (!c) throw new CartError("Order not found");
    if (c.factoryPackedAt) return null;
    if (c.status !== "CONFIRMED")
      throw new CartError("Only a paid order waiting to ship can be packed");
    await tx.groupCart.update({
      where: { id: cartId },
      data: { factoryPackedAt: now, factoryPackedById: factoryId },
    });
    return c;
  });
  if (!cart) return;
  await notifyRole(
    "ADMIN",
    {
      title: "Ready for PickMe pickup",
      body: `Cart ${cart.code} is packed at the factory. Book PickMe from the factory.`,
      href: "/admin/orders",
    },
    "WAREHOUSE",
  );
}
