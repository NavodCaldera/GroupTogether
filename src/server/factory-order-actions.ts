"use server";

import { revalidatePath } from "next/cache";
import { requireSeller } from "./auth/session";
import { CartError } from "./carts/service";
import { markFactoryPacked } from "./factory-orders";
import { flash } from "./flash";

export type FactoryOrderState = { error?: string };

export async function markFactoryPackedAction(
  _p: FactoryOrderState,
  fd: FormData,
): Promise<FactoryOrderState> {
  const seller = await requireSeller();
  try {
    await markFactoryPacked(seller.id, String(fd.get("cartId") ?? ""));
  } catch (e) {
    if (e instanceof CartError) return { error: e.message };
    throw e;
  }
  revalidatePath("/seller/orders");
  revalidatePath("/admin/orders");
  await flash("Marked packed");
  return {};
}
