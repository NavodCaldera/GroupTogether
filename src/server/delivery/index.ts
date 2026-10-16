import "server-only";
import type { DeliveryStatus } from "@/generated/prisma/client";
import { formatLKR } from "@/lib/format";
import { CartError } from "../carts/service";
import { db } from "../db";
import { notify } from "../notify";
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
        driverPhone: booking.driverPhone ?? null,
      },
    }),
    db.groupCart.update({ where: { id: cartId }, data: { status: "DISPATCHED" } }),
  ]);

  const fee = booking.quotedFee ? ` of about ${formatLKR(booking.quotedFee)}` : "";
  await notify(
    [cart.ownerId],
    {
      title: "Your group order is on the way",
      body: `A PickMe driver is bringing your order to ${cart.deliveryAddress}. Please pay the delivery fee${fee} to the driver.`,
      href: `/c/${cart.code}`,
    },
    { email: true },
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
