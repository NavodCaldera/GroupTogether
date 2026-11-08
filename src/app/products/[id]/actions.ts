"use server";

import { revalidatePath } from "next/cache";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { CartError } from "@/server/errors";
import { db } from "@/server/db";
import { setCartItem } from "@/server/orders/cart";

export type AddState = { error?: string; ok?: string; at?: number };

/** Adds the chosen quantity to what the buyer already has of this size. */
export async function addToCartAction(_p: AddState, fd: FormData): Promise<AddState> {
  const user = await requireUser([...BUYER_ROLES]);
  const variantId = String(fd.get("variantId") ?? "");
  const qty = Number(String(fd.get("qty") ?? ""));
  if (!variantId) return { error: "Pick a size" };
  if (!Number.isInteger(qty) || qty < 1) return { error: "Enter a whole quantity" };
  try {
    const existing = await db.cartItem.findUnique({
      where: { buyerId_variantId: { buyerId: user.id, variantId } },
      select: { qty: true },
    });
    await setCartItem(user.id, variantId, (existing?.qty ?? 0) + qty);
  } catch (e) {
    if (e instanceof CartError) return { error: e.message };
    throw e;
  }
  revalidatePath("/cart");
  return { ok: "Added to cart", at: Date.now() };
}
