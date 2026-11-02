"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireSeller } from "./auth/session";
import { createBrandOffer, reviseBrandOffer } from "./brands";
import { CatalogueError, adjustStock, saveProduct } from "./catalogue";
import { createOffer } from "./offers";
import { db } from "./db";
import { flash } from "./flash";
import { UploadError } from "./storage";

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
    const input = {
      name: str(fd, "name"),
      description: str(fd, "description"),
      actualPrice: str(fd, "actualPrice"),
      offerPrice: str(fd, "offerPrice"),
      pieces: str(fd, "pieces"),
      productUrl: str(fd, "productUrl"),
      packDetails: str(fd, "packDetails"),
      packSize: str(fd, "packSize"),
      dispatchDays: str(fd, "dispatchDays"),
      hasExpiry: fd.has("hasExpiry"),
      expiryDate: str(fd, "expiryDate"),
      minShelfLifeDays: str(fd, "minShelfLifeDays"),
    };
    const upload = fd.get("photo");
    const photo = upload instanceof File && upload.size > 0 ? upload : null;
    const offerId = str(fd, "offerId");
    if (offerId)
      await reviseBrandOffer(seller.id, offerId, input, photo, Number(str(fd, "revision")));
    else await createBrandOffer(seller.id, input, photo);
  } catch (e) {
    if (e instanceof CatalogueError || e instanceof UploadError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
  revalidatePath("/seller");
  await flash("Gift product sent for review.");
  revalidatePath("/admin/brands");
  redirect("/seller?tab=products");
}

/** A factory publishes or edits its own listing; it goes live without review (2026-11-03). */
export async function saveFactoryProductAction(
  _p: SellerState,
  fd: FormData,
): Promise<SellerState> {
  const seller = await requireSeller();
  if (await db.user.count({ where: { id: seller.id, isBrand: true } }))
    return { error: "Luxury brands add gift products" };
  const id = str(fd, "id") || null;
  const photo = fd.get("photo");
  let savedId = id;
  try {
    const p = await saveProduct(
      id,
      Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")),
      photo instanceof File ? photo : null,
      { sellerId: seller.id },
    );
    savedId = p.id;
  } catch (e) {
    if (e instanceof CatalogueError || e instanceof UploadError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
  revalidatePath("/seller");
  revalidatePath("/shop");
  await flash(id ? "Saved" : "Published. Add sizes and stock to show it in the shop.");
  if (!id) redirect(`/seller/products/${savedId}`);
  return {};
}

export async function factoryStockAction(_p: SellerState, fd: FormData): Promise<SellerState> {
  const seller = await requireSeller();
  const productId = str(fd, "productId");
  try {
    await adjustStock(productId, str(fd, "size"), str(fd, "colour"), Number(str(fd, "delta")), {
      sellerId: seller.id,
    });
  } catch (e) {
    if (e instanceof CatalogueError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/seller/products/${productId}`);
  revalidatePath("/shop");
  await flash("Stock updated");
  return {};
}
