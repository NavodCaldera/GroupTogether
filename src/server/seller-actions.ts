"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireFactory, requireSeller } from "./auth/session";
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
  const { factoryId } = await requireFactory("products");
  const id = str(fd, "id") || null;
  const photo = fd.get("photo");
  let savedId = id;
  try {
    const p = await saveProduct(
      id,
      Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")),
      photo instanceof File ? photo : null,
      { sellerId: factoryId },
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
  const { factoryId } = await requireFactory("products");
  const productId = str(fd, "productId");
  try {
    await adjustStock(productId, str(fd, "size"), str(fd, "colour"), Number(str(fd, "delta")), {
      sellerId: factoryId,
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

/**
 * Inline stock on the factory's Products page (2026-11-03): add or remove pieces of one size with
 * no client script. Problems come back as the pop-up message.
 */
export async function factorySizeStockAction(fd: FormData) {
  const { factoryId } = await requireFactory("products");
  const productId = str(fd, "productId");
  const qty = Number(str(fd, "qty"));
  const sign = str(fd, "dir") === "remove" ? -1 : 1;
  try {
    await adjustStock(productId, str(fd, "size"), str(fd, "colour"), sign * qty, {
      sellerId: factoryId,
    });
    await flash(sign > 0 ? `Added ${qty}` : `Removed ${qty}`);
  } catch (e) {
    if (!(e instanceof CatalogueError)) throw e;
    await flash(e.message);
  }
  revalidatePath("/seller", "layout");
  revalidatePath("/shop");
}

/** A sold-out size that was never in a cart can be taken off the listing. */
export async function removeFactorySizeAction(fd: FormData) {
  const { factoryId } = await requireFactory("products");
  const removed = await db.variant.deleteMany({
    where: {
      id: str(fd, "variantId"),
      available: 0,
      reserved: 0,
      lines: { none: {} },
      product: { sellerId: factoryId },
    },
  });
  await flash(removed.count ? "Size removed" : "This size has orders, so it stays");
  revalidatePath("/seller", "layout");
}
