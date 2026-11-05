import "server-only";
import type { GroupCart } from "@/generated/prisma/client";
import { amountDue } from "@/lib/cart-rules";
import { toD } from "@/lib/decimal";
import { factoryFulfilment } from "@/lib/fulfilment";
import { db, type Tx } from "../db";
import { spendCartTokens } from "../tokens";
import { notify, notifyRole } from "../notify";
import { appendBrandEvent, flushBrandNotices } from "../brand-communications";
import { cancelPaidLines, flushCancellationNotices } from "../cancellations";
import { lockLedgerUsers } from "./locks";
import { CartError } from "./errors";

/** Caller holds participant advisories and the cart row. Only reviewed payment or fully
 * token-covered READY carts can confirm. The state change and all effects commit atomically.
 */
export async function confirmPaidCart(
  tx: Tx,
  cartId: string,
  actorId: string,
  now: Date,
): Promise<GroupCart> {
  const cart = await tx.groupCart.findUniqueOrThrow({ where: { id: cartId } });
  if (cart.status === "READY") {
    const lines = await tx.cartLine.findMany({
      where: { cartId },
      select: { tokensApplied: true },
    });
    if (
      !amountDue(
        toD(cart.total),
        lines.map((l) => toD(l.tokensApplied)),
      ).isZero()
    )
      throw new CartError("This cart still requires payment");
  } else if (cart.status !== "SLIP_REVIEW") throw new CartError("This cart cannot be confirmed");
  const confirmed = await tx.groupCart.update({
    where: { id: cart.id },
    data: { status: "CONFIRMED", confirmedAt: now },
  });
  const productIds = await tx.cartLine.findMany({
    where: { cartId },
    select: { variant: { select: { productId: true } } },
  });
  for (const id of [...new Set(productIds.map((l) => l.variant.productId))].sort())
    await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id=${id} FOR SHARE`;
  const lines = await tx.cartLine.findMany({
    where: { cartId: cart.id },
    orderBy: [{ variantId: "asc" }, { id: "asc" }],
  });
  await lockLedgerUsers(
    tx,
    lines.map((l) => l.userId),
  );
  await spendCartTokens(tx, cart.id);
  await tx.giftOrder.updateMany({
    where: { cartId: cart.id, status: "RESERVED" },
    data: { status: "READY", paidAt: now },
  });
  const gifts = await tx.giftOrder.findMany({
    where: { cartId: cart.id, status: "READY" },
    include: { offer: { select: { sellerId: true, name: true } } },
  });
  for (const gift of gifts)
    await appendBrandEvent(tx, {
      brandId: gift.offer.sellerId,
      kind: "GIFT",
      subjectId: gift.id,
      title: `${gift.offer.name} · G-${gift.id.slice(-8).toUpperCase()}`,
      authorId: actorId,
      body: "Basket payment approved. This gift is ready for the brand to acknowledge and dispatch.",
      requestKey: `gift-payment:${gift.id}`,
    });
  for (const l of lines) {
    await tx.variant.update({
      where: { id: l.variantId },
      data: { reserved: { decrement: l.qty }, sold: { increment: l.qty } },
    });
  }
  const hidden = await tx.cartLine.findMany({
    where: {
      cartId,
      status: "ACTIVE",
      variant: {
        product: {
          OR: [{ hiddenAt: { not: null } }, { seller: { factoryProfile: { status: "REMOVED" } } }],
        },
      },
    },
    select: {
      id: true,
      variant: {
        select: {
          product: {
            select: {
              hiddenReason: true,
              seller: {
                select: { factoryProfile: { select: { status: true, removalReason: true } } },
              },
            },
          },
        },
      },
    },
  });
  for (const line of hidden) {
    const p = line.variant.product,
      profile = p.seller?.factoryProfile;
    await cancelPaidLines(
      tx,
      [line.id],
      profile?.status === "REMOVED"
        ? profile.removalReason || "Factory removed"
        : p.hiddenReason || "Product hidden",
    );
  }
  return hidden.length ? tx.groupCart.findUniqueOrThrow({ where: { id: cartId } }) : confirmed;
}

/** Called only after a successful confirmation transaction, for either payment route. */
export async function notifyCartConfirmed(cart: GroupCart): Promise<void> {
  await flushCancellationNotices();
  if (cart.status === "CANCELLED") return;
  const members = await db.cartMember.findMany({
    where: { cartId: cart.id },
    select: { userId: true },
  });
  await notify(
    members.map((m) => m.userId),
    {
      title: "Group order confirmed",
      body: `Payment for "${cart.name || cart.code}" is confirmed. We'll send it by PickMe to the cart owner. The owner pays the delivery fee to the driver.`,
      href: `/c/${cart.code}`,
    },
  );
  if (factoryFulfilment()) {
    const factory = await db.user.findFirst({
      where: {
        locked: false,
        products: {
          some: { variants: { some: { lines: { some: { cartId: cart.id, status: "ACTIVE" } } } } },
        },
      },
      select: { id: true },
    });
    if (factory)
      await notify([factory.id], {
        title: "New order to pack",
        body: `Cart ${cart.code} is paid. Pack it and mark it packed for PickMe pickup.`,
        href: "/seller/orders",
      });
  } else {
    await notifyRole("PACKER", {
      title: "New order to pack",
      body: `Cart ${cart.code} is paid. One of you checks and gathers it, someone else rechecks and packs it.`,
      href: `/packing/${cart.code}`,
    });
  }
  await flushBrandNotices().catch(() => {});
}
