"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireSeller } from "./auth/session";
import { CatalogueError } from "./catalogue";
import { deleteDraft, sellerSaveListing, withdrawFromReview } from "./seller";
import { UploadError } from "./storage";

export type SellerState = { error?: string; ok?: string };

async function attempt(fn: () => Promise<unknown>, ok?: string): Promise<SellerState> {
  try {
    await fn();
    return ok ? { ok } : {};
  } catch (e) {
    if (e instanceof CatalogueError || e instanceof UploadError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * Saves the seller's one-screen listing: details, photo and stock per size (`qty:<size>` fields).
 * "Send for review" (`intent=send`) also submits it. Either way, back to the list.
 */
export async function sellerListingAction(_p: SellerState, fd: FormData): Promise<SellerState> {
  const seller = await requireSeller();
  const id = str(fd, "id") || null;
  const photo = fd.get("photo");
  const send = str(fd, "intent") === "send";
  const fields = [...fd.entries()].filter(([, v]) => typeof v === "string");
  const res = await attempt(() =>
    sellerSaveListing(
      seller.id,
      id,
      Object.fromEntries(fields.filter(([k]) => !k.startsWith("qty:"))),
      photo instanceof File ? photo : null,
      Object.fromEntries(
        fields.filter(([k]) => k.startsWith("qty:")).map(([k, v]) => [k.slice(4), v]),
      ),
      send,
    ),
  );
  if (res.error) return res;
  revalidatePath("/seller", "layout");
  redirect(`/seller?done=${send ? "sent" : "saved"}`);
}

/** "Edit" on a product waiting for review: back to draft, then its form. */
export async function editAction(_p: SellerState, fd: FormData): Promise<SellerState> {
  const seller = await requireSeller();
  const productId = str(fd, "productId");
  const res = await attempt(() => withdrawFromReview(seller.id, productId));
  revalidatePath("/seller", "layout");
  if (res.error) return res;
  redirect(`/seller/products/${productId}`);
}

export async function deleteDraftAction(_p: SellerState, fd: FormData): Promise<SellerState> {
  const seller = await requireSeller();
  const res = await attempt(() => deleteDraft(seller.id, str(fd, "productId")));
  if (res.error) return res;
  revalidatePath("/seller", "layout");
  redirect("/seller?done=deleted");
}
