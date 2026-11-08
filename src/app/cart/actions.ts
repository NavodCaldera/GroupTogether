"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { CartError } from "@/server/carts/errors";
import { setCartItem } from "@/server/orders/cart";

/** Sets a line's quantity; 0 removes it. Errors come back on the cart page. */
export async function setQtyAction(fd: FormData) {
  const user = await requireUser([...BUYER_ROLES], "/cart");
  const variantId = String(fd.get("variantId") ?? "");
  const qty = Number(String(fd.get("qty") ?? ""));
  const agent = String(fd.get("agent") ?? "");
  const keep = /^[a-z0-9]{1,40}$/.test(agent) ? `agent=${agent}&` : "";
  try {
    await setCartItem(user.id, variantId, qty);
  } catch (e) {
    if (e instanceof CartError) redirect(`/cart?${keep}error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/cart");
}
