"use server";

import { revalidatePath } from "next/cache";
import type { AdminState } from "./admin-actions";
import { requireAdmin } from "./auth/session";
import { CatalogueError } from "./catalogue";
import { linkOfferProduct } from "./designs";
import { flash } from "./flash";

/** Admin: puts an accepted offer's pieces on a shop product, one of the seller's designs. */
export async function linkOfferAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin();
  const offerId = String(fd.get("offerId") ?? "");
  try {
    await linkOfferProduct(offerId, String(fd.get("productId") ?? ""));
  } catch (e) {
    if (e instanceof CatalogueError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/admin/offers/${offerId}`);
  await flash("Linked");
  return {};
}
