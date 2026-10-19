import "server-only";
import type { DeliveryStatus } from "@/generated/prisma/client";
import { formatLKR } from "@/lib/format";
import { CartError } from "../carts/service";
import { db } from "../db";
import { notify, notifyRole } from "../notify";
import { type Booking, deliveryProvider } from "./provider";

/** CONFIRMED → DISPATCHED: books the one PickMe drop to the cart owner. */
export async function bookDelivery(cartId: string, manual?: Partial<Booking>) {
  const cart = await db.groupCart.findUnique({
    where: { id: cartId },
    include: { owner: true, lines: { select: { qty: true } }, delivery: true },
  });
  if (!cart) throw new CartError("Cart not found");
  if (cart.status !== "CONFIRMED" || cart.delivery)
    throw new CartError("Only a confirmed cart without a delivery can be booked");

  const provider = deliveryProvider();
  const booking = await provider.book(
    {
      reference: cart.code,
      recipientName: cart.owner.name,
      recipientPhone: cart.deliveryPhone ?? cart.owner.phone ?? "",
      address: cart.deliveryAddress ?? cart.owner.address ?? "",
      city: cart.deliveryCity ?? cart.owner.city ?? "",
      items: cart.lines.reduce((n, l) => n + l.qty, 0),
    },
    manual,
  );

  await db.$transaction([
    db.delivery.create({
      data: {
        cartId,
        provider: provider.name,
        externalRef: booking.externalRef,
        quotedFee: booking.quotedFee,
        trackingUrl: booking.trackingUrl,
        driverName: booking.driverName ?? null,
      },
    }),
    db.groupCart.update({ where: { id: cartId }, data: { status: "DISPATCHED" } }),
  ]);

  const fee = booking.quotedFee ? ` of about ${formatLKR(booking.quotedFee)}` : "";
  await notify([cart.ownerId], {
    title: "Your group order is on the way",
    body: `A PickMe driver is bringing your order to ${cart.deliveryAddress}. Please pay the delivery fee${fee} to the driver.`,
    href: `/c/${cart.code}`,
  });
  await notifyRole("PACKER", {
    title: "PickMe booked",
    body: `Cart ${cart.code}: hand the packed parcel to the driver${booking.driverName ? ` (${booking.driverName})` : ""} and mark it handed over.`,
    href: `/packing/${cart.code}`,
  });
}

/**
 * The cart owner says the PickMe drop reached them (from their dashboard): DISPATCHED →
 * DELIVERED, the same as the admin's "Mark delivered". Not after a failed drop.
 */
export async function markReceived(userId: string, cartId: string) {
  const cart = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${cartId} FOR UPDATE`;
    const c = await tx.groupCart.findUnique({ where: { id: cartId }, include: { delivery: true } });
    if (!c) throw new CartError("This cart no longer exists");
    if (c.ownerId !== userId) throw new CartError("Only the cart owner can mark it delivered");
    if (c.status === "DELIVERED") return null;
    if (
      c.status !== "DISPATCHED" ||
      !c.delivery ||
      !["BOOKED", "PICKED_UP"].includes(c.delivery.status)
    )
      throw new CartError("This order isn't on its way, so it can't be marked delivered");
    await tx.delivery.update({ where: { id: c.delivery.id }, data: { status: "DELIVERED" } });
    await tx.groupCart.update({ where: { id: cartId }, data: { status: "DELIVERED" } });
    return tx.groupCart.findUnique({
      where: { id: cartId },
      select: {
        code: true,
        owner: { select: { name: true } },
        members: { select: { userId: true } },
      },
    });
  });
  if (!cart) return;
  await notify(
    cart.members.map((m) => m.userId).filter((id) => id !== userId),
    {
      title: "Your group order was delivered",
      body: `${cart.owner.name} has received the order. Collect your items from them.`,
      href: `/c/${cart.code}`,
    },
  );
}

/** From the admin page or the PickMe webhook. DELIVERED closes the cart. */
export async function setDeliveryStatus(deliveryId: string, status: DeliveryStatus) {
  const d = await db.delivery.update({ where: { id: deliveryId }, data: { status } });
  if (status === "DELIVERED") {
    await db.groupCart.update({ where: { id: d.cartId }, data: { status: "DELIVERED" } });
  }
  return d;
}
