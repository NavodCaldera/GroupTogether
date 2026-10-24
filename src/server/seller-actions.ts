"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireSeller } from "./auth/session";
import { CatalogueError } from "./catalogue";
import { createBrandOffer } from "./brands";
import { createOffer } from "./offers";

export type SellerState = { error?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** The seller's one form: product name, details about the stock and the total price. */
export async function sendOfferAction(_p: SellerState, fd: FormData): Promise<SellerState> {
  const seller = await requireSeller();
  try {
    await createOffer(seller.id, {
      name: str(fd, "name"),
      description: str(fd, "description"),
      amount: str(fd, "amount"),
      kind: str(fd, "kind") || undefined,
      productId: str(fd, "productId"),
    });
  } catch (e) {
    if (e instanceof CatalogueError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
  revalidatePath("/seller");
  redirect("/seller?done=sent");
}

/** A luxury brand's discounted product: actual price, discount price, pieces and its link. */
export async function sendBrandOfferAction(_p: SellerState, fd: FormData): Promise<SellerState> {
  const seller = await requireSeller();
  try {
    await createBrandOffer(seller.id, {
      name: str(fd, "name"),
      description: str(fd, "description"),
      actualPrice: str(fd, "actualPrice"),
      offerPrice: str(fd, "offerPrice"),
      pieces: str(fd, "pieces"),
      productUrl: str(fd, "productUrl"),
    });
  } catch (e) {
    if (e instanceof CatalogueError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
  revalidatePath("/seller");
  redirect("/seller?done=sent");
}
