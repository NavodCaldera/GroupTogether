import "server-only";
import type { OrderTotals } from "@/lib/agent-money";
import { db } from "../db";
import { getSettings } from "../settings";
import { assertBuyer, CheckoutError, loadCart, ratesOf, type CartLineView } from "./checkout";

const MAX_QTY = 999;

/** Saves a wish; holds no stock. qty 0 removes the item. */
export async function setCartItem(buyerId: string, variantId: string, qty: number): Promise<void> {
  if (!Number.isInteger(qty) || qty < 0 || qty > MAX_QTY)
    throw new CheckoutError("Enter a whole quantity");
  await assertBuyer(db, buyerId);
  if (qty === 0) {
    await db.cartItem.deleteMany({ where: { buyerId, variantId } });
    return;
  }
  const variant = await db.variant.findUnique({
    where: { id: variantId },
    select: {
      available: true,
      product: { select: { title: true, status: true, sellerId: true, factoryPrice: true } },
    },
  });
  if (
    !variant ||
    variant.product.status !== "LIVE" ||
    !variant.product.sellerId ||
    variant.product.factoryPrice === null
  )
    throw new CheckoutError("No longer available");
  if (variant.available < qty)
    throw new CheckoutError(`Only ${variant.available} left of ${variant.product.title}`);
  await db.cartItem.upsert({
    where: { buyerId_variantId: { buyerId, variantId } },
    create: { buyerId, variantId, qty },
    update: { qty },
  });
}

export async function cartView(buyerId: string): Promise<{
  factories: { factoryId: string; name: string; lines: CartLineView[]; totals: OrderTotals }[];
}> {
  const rates = ratesOf(await getSettings());
  return { factories: await loadCart(db, buyerId, rates) };
}
