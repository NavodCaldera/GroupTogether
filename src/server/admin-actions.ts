"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import type { DeliveryStatus } from "@/generated/prisma/client";
import {
  AuthError,
  createOperationalAdmin,
  createPacker,
  createSeller,
  setUserLocked,
} from "./auth/service";
import { requireAdmin, requireAnyAdmin } from "./auth/session";
import { assertManagesUser } from "./admin-users";
import { CartError, cancelCart } from "./carts/service";
import { approveSlip, rejectSlip } from "./carts/slips";
import { CatalogueError, adjustStock, saveProduct, setProductHidden } from "./catalogue";
import { db } from "./db";
import { setCommission, SettingsError } from "./settings";
import { bookDelivery, setDeliveryStatus } from "./delivery";
import { flash } from "./flash";
import { linkOfferProduct } from "./designs";
import { decideOffer, noteOffer } from "./offers";
import { factoryFulfilment } from "@/lib/fulfilment";
import { UploadError } from "./storage";

export type AdminState = { error?: string };

/** Expected failures go back to the form; `ok` pops up as the success message. */
async function attempt(fn: () => Promise<unknown>, ok?: string): Promise<AdminState> {
  try {
    await fn();
    if (ok) await flash(ok);
    return {};
  } catch (e) {
    if (
      e instanceof CartError ||
      e instanceof CatalogueError ||
      e instanceof UploadError ||
      e instanceof SettingsError ||
      e instanceof AuthError
    )
      return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function approveSlipAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("WAREHOUSE");
  const slipId = str(fd, "slipId");
  const res = await attempt(() => approveSlip(admin.id, slipId));
  revalidatePath("/admin", "layout");
  if (res.error) return res;
  // Back to the queue, which says it's done and offers the delivery booking and the next slip.
  redirect(`/admin/slips?done=approved&cart=${await slipCartCode(slipId)}`);
}

export async function rejectSlipAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("WAREHOUSE");
  const slipId = str(fd, "slipId");
  const res = await attempt(() => rejectSlip(admin.id, slipId, str(fd, "note")));
  revalidatePath("/admin", "layout");
  if (res.error) return res;
  redirect(`/admin/slips?done=rejected&cart=${await slipCartCode(slipId)}`);
}

async function slipCartCode(slipId: string) {
  const slip = await db.paymentSlip.findUnique({
    where: { id: slipId },
    select: { cart: { select: { code: true } } },
  });
  return slip?.cart.code ?? "";
}

export async function adminCancelAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("WAREHOUSE");
  const res = await attempt(
    () => cancelCart(admin, str(fd, "cartId"), str(fd, "reason")),
    "Cancelled",
  );
  revalidatePath("/admin", "layout");
  return res;
}

export async function bookDeliveryAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin("WAREHOUSE");
  const cartId = str(fd, "cartId");
  const fee = str(fd, "quotedFee");
  const res = await attempt(async () => {
    if (fee && !/^\d+(\.\d{1,2})?$/.test(fee)) throw new CartError("Enter the fee as a number");
    await bookDelivery(cartId, {
      externalRef: str(fd, "externalRef") || null,
      quotedFee: fee || null,
      trackingUrl: str(fd, "trackingUrl") || null,
      driverName: str(fd, "driverName") || null,
    });
  });
  revalidatePath("/admin", "layout");
  if (res.error) return res;
  await flash("Delivery booked");
  redirect("/admin/orders");
}

const DELIVERY_STATUSES: DeliveryStatus[] = [
  "BOOKED",
  "PICKED_UP",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
];

export async function deliveryStatusAction(fd: FormData) {
  await requireAdmin("WAREHOUSE");
  const status = str(fd, "status") as DeliveryStatus;
  if (!DELIVERY_STATUSES.includes(status)) return;
  await setDeliveryStatus(str(fd, "deliveryId"), status);
  revalidatePath("/admin", "layout");
  await flash(`Delivery marked ${status.replace("_", " ").toLowerCase()}`);
}

export async function saveProductAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin("FACTORY");
  const id = str(fd, "id") || null;
  const photo = fd.get("photo");
  let savedId = id;
  const res = await attempt(async () => {
    const offerId = str(fd, "offerId");
    if (
      offerId &&
      (await db.stockOffer.count({ where: { id: offerId, seller: { isBrand: true } } }))
    )
      throw new CatalogueError("Premium brand products are gift-only");
    const p = await saveProduct(
      id,
      Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")),
      photo instanceof File ? photo : null,
    );
    savedId = p.id;
    // Made from a seller's accepted offer: it becomes one of their designs (2026-10-24).
    if (!id && offerId) await linkOfferProduct(offerId, p.id);
  });
  if (res.error) return res;
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  await flash(id ? "Saved" : "Product created");
  if (!id) redirect(`/admin/products/${savedId}`);
  return {};
}

/** Hides a listing from the shop (any factory's), or shows it again. */
export async function setProductHiddenAction(fd: FormData) {
  const admin = await requireAdmin("FACTORY");
  const hide = str(fd, "hide") === "1";
  const result = await attempt(async () => {
    if (hide) {
      const { hideProduct } = await import("./quality");
      await hideProduct(admin.id, str(fd, "productId"), str(fd, "reason"));
    } else await setProductHidden(str(fd, "productId"), false);
  });
  if (result.error) {
    await flash(result.error);
    return;
  }
  revalidatePath("/admin/products", "layout");
  revalidatePath("/shop");
  await flash(hide ? "Hidden from the shop" : "Back in the shop");
}

export async function adjustStockAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin("FACTORY");
  const productId = str(fd, "productId");
  const res = await attempt(
    () => adjustStock(productId, str(fd, "size"), str(fd, "colour"), Number(str(fd, "delta"))),
    "Stock updated",
  );
  revalidatePath(`/admin/products/${productId}`);
  // Stock decides whether it shows in the shop.
  revalidatePath("/shop");
  return res;
}

const settingsSchema = z.object({
  minOrderValue: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter the minimum as a number"),
  cartLifetimeHours: z.coerce.number().int().min(1).max(720),
  slipWindowHours: z.coerce.number().int().min(1).max(72),
  bankName: z.string().trim().max(80),
  bankBranch: z.string().trim().max(80),
  accountName: z.string().trim().max(80),
  accountNumber: z.string().trim().max(40),
});

export async function saveSettingsAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin("CORE");
  const res = await attempt(async () => {
    const data = settingsSchema.parse(Object.fromEntries(fd));
    await db.settings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  }, "Settings saved. New carts use them; existing carts keep their minimum.");
  revalidatePath("/admin/settings");
  return res;
}

export async function lockUserAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAnyAdmin();
  const userId = str(fd, "userId");
  const locked = str(fd, "locked") === "1";
  const res = await attempt(
    async () => {
      await assertManagesUser(admin.adminArea, userId);
      await setUserLocked(userId, locked);
    },
    locked ? "Locked and signed out everywhere" : "Unlocked: they can sign in again",
  );
  revalidatePath("/admin/users", "layout");
  return res;
}

/** Accept or decline a factory seller's stock offer, or send a note without deciding. */
export async function decideOfferAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin("FACTORY");
  const offerId = str(fd, "offerId");
  const decision = str(fd, "decision");
  if (decision === "note") {
    const res = await attempt(() => noteOffer(offerId, str(fd, "note")));
    revalidatePath("/admin", "layout");
    if (res.error) return res;
    redirect(`/admin/offers/${offerId}?done=noted`);
  }
  const accept = decision === "accept";
  const res = await attempt(() => decideOffer(offerId, accept, str(fd, "note")));
  revalidatePath("/admin", "layout");
  if (res.error) return res;
  redirect(`/admin/offers?done=${accept ? "accepted" : "declined"}`);
}

/** Factory admins add factory sellers; premium admins add brands. */
export async function createSellerAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAnyAdmin();
  if (admin.adminArea !== "PREMIUM" && admin.adminArea !== "FACTORY")
    return { error: "Sellers are added by factory admins" };
  const isBrand = admin.adminArea === "PREMIUM";
  let id = "";
  const res = await attempt(async () => {
    id = (await createSeller({ ...Object.fromEntries(fd), isBrand })).id;
  });
  if (res.error) return res;
  revalidatePath("/admin/users");
  await flash(
    `${isBrand ? "Brand" : "Seller"} account created. Send them their email and password.`,
  );
  redirect(`/admin/users/${id}`);
}

export async function createPackerAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin("WAREHOUSE");
  if (factoryFulfilment()) return { error: "Packing is paused while factories pack orders" };
  let id = "";
  const res = await attempt(async () => {
    id = (await createPacker(Object.fromEntries(fd))).id;
  });
  if (res.error) return res;
  revalidatePath("/admin/users");
  await flash("Packing staff account created. Send them their email and password.");
  redirect(`/admin/users/${id}`);
}

export async function createOperationalAdminAction(
  _p: AdminState,
  fd: FormData,
): Promise<AdminState> {
  // Only the core admin adds admins, for any of the four areas.
  await requireAdmin("CORE");
  const res = await attempt(
    () => createOperationalAdmin(Object.fromEntries(fd)),
    "Admin account created",
  );
  if (res.error) return res;
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function setCommissionAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin("CORE");
  const result = await attempt(
    () => setCommission(admin.id, String(fd.get("commissionPerPiece") ?? "")),
    "Commission saved",
  );
  revalidatePath("/admin/settings");
  revalidatePath("/seller/new");
  return result;
}
