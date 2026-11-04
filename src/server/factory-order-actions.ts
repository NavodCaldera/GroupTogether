"use server";

import { revalidatePath } from "next/cache";
import { requireFactory } from "./auth/session";
import { CartError } from "./carts/service";
import { markFactoryPacked } from "./factory-orders";
import { flash } from "./flash";

export type FactoryOrderState = { error?: string };

export async function markFactoryPackedAction(
  _p: FactoryOrderState,
  fd: FormData,
): Promise<FactoryOrderState> {
  const me = await requireFactory("orders");
  try {
    await markFactoryPacked(me.factoryId, String(fd.get("cartId") ?? ""), me.id);
  } catch (e) {
    if (e instanceof CartError) return { error: e.message };
    throw e;
  }
  revalidatePath("/seller/orders");
  revalidatePath("/admin/orders");
  await flash("Marked packed");
  return {};
}
