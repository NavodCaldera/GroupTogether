"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireSeller } from "./auth/session";
import { CatalogueError } from "./catalogue";
import {
  deleteDraft,
  sellerAdjustStock,
  sellerSaveProduct,
  submitForReview,
  withdrawFromReview,
} from "./seller";
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

export async function sellerSaveProductAction(_p: SellerState, fd: FormData): Promise<SellerState> {
  const seller = await requireSeller();
  const id = str(fd, "id") || null;
  const photo = fd.get("photo");
  let savedId = id;
  const res = await attempt(async () => {
    const p = await sellerSaveProduct(
      seller.id,
      id,
      Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")),
      photo instanceof File ? photo : null,
    );
    savedId = p.id;
  });
  if (res.error) return res;
  revalidatePath("/seller", "layout");
  // A new product goes straight to its page, where the seller adds stock by size.
  if (!id) redirect(`/seller/products/${savedId}?created=1`);
  return { ok: "Saved" };
}

export async function sellerStockAction(_p: SellerState, fd: FormData): Promise<SellerState> {
  const seller = await requireSeller();
  const productId = str(fd, "productId");
  const res = await attempt(
    () =>
      sellerAdjustStock(
        seller.id,
        productId,
        str(fd, "size"),
        str(fd, "colour"),
        Number(str(fd, "delta")),
      ),
    "Stock updated",
  );
  revalidatePath(`/seller/products/${productId}`);
  return res;
}

export async function submitForReviewAction(_p: SellerState, fd: FormData): Promise<SellerState> {
  const seller = await requireSeller();
  const productId = str(fd, "productId");
  const res = await attempt(() => submitForReview(seller.id, productId));
  if (res.error) return res;
  revalidatePath("/seller", "layout");
  redirect(`/seller/products/${productId}?submitted=1`);
}

export async function withdrawAction(_p: SellerState, fd: FormData): Promise<SellerState> {
  const seller = await requireSeller();
  const productId = str(fd, "productId");
  const res = await attempt(() => withdrawFromReview(seller.id, productId));
  revalidatePath("/seller", "layout");
  if (res.error) return res;
  redirect(`/seller/products/${productId}?withdrawn=1`);
}

export async function deleteDraftAction(_p: SellerState, fd: FormData): Promise<SellerState> {
  const seller = await requireSeller();
  const res = await attempt(() => deleteDraft(seller.id, str(fd, "productId")));
  if (res.error) return res;
  revalidatePath("/seller", "layout");
  redirect("/seller?deleted=1");
}
