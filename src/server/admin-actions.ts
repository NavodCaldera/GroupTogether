"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import type { DeliveryStatus } from "@/generated/prisma/client";
import { AuthError, createSeller, setUserLocked } from "./auth/service";
import { requireAdmin } from "./auth/session";
import { CartError, cancelCart } from "./carts/service";
import { approveSlip, rejectSlip } from "./carts/slips";
import { CatalogueError, adjustStock, saveProduct } from "./catalogue";
import { db } from "./db";
import { bookDelivery, setDeliveryStatus } from "./delivery";
import { publishProduct, returnToSeller } from "./seller";
import { UploadError } from "./storage";

export type AdminState = { error?: string; ok?: string };

async function attempt(fn: () => Promise<unknown>, ok?: string): Promise<AdminState> {
  try {
    await fn();
    return ok ? { ok } : {};
  } catch (e) {
    if (
      e instanceof CartError ||
      e instanceof CatalogueError ||
      e instanceof UploadError ||
      e instanceof AuthError
    )
      return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function approveSlipAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const slipId = str(fd, "slipId");
  const res = await attempt(() => approveSlip(admin.id, slipId));
  revalidatePath("/admin", "layout");
  if (res.error) return res;
  // Back to the queue, which says it's done and offers the delivery booking and the next slip.
  redirect(`/admin/slips?done=approved&cart=${await slipCartCode(slipId)}`);
}

export async function rejectSlipAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
  const res = await attempt(
    () => cancelCart(admin, str(fd, "cartId"), str(fd, "reason")),
    "Cancelled",
  );
  revalidatePath("/admin", "layout");
  return res;
}

export async function bookDeliveryAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin();
  const cartId = str(fd, "cartId");
  const fee = str(fd, "quotedFee");
  const res = await attempt(async () => {
    if (fee && !/^\d+(\.\d{1,2})?$/.test(fee)) throw new CartError("Enter the fee as a number");
    await bookDelivery(cartId, {
      externalRef: str(fd, "externalRef") || null,
      quotedFee: fee || null,
      trackingUrl: str(fd, "trackingUrl") || null,
      driverName: str(fd, "driverName") || null,
      driverPhone: str(fd, "driverPhone") || null,
    });
  });
  revalidatePath("/admin", "layout");
  if (res.error) return res;
  const cart = await db.groupCart.findUnique({ where: { id: cartId }, select: { code: true } });
  redirect(`/admin/carts/${cart?.code}?booked=1`);
}

const DELIVERY_STATUSES: DeliveryStatus[] = [
  "BOOKED",
  "PICKED_UP",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
];

export async function deliveryStatusAction(fd: FormData) {
  await requireAdmin();
  const status = str(fd, "status") as DeliveryStatus;
  if (!DELIVERY_STATUSES.includes(status)) return;
  await setDeliveryStatus(str(fd, "deliveryId"), status);
  revalidatePath("/admin", "layout");
}

export async function saveProductAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin();
  const id = str(fd, "id") || null;
  const photo = fd.get("photo");
  let savedId = id;
  const res = await attempt(async () => {
    const p = await saveProduct(
      id,
      Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")),
      photo instanceof File ? photo : null,
    );
    savedId = p.id;
  });
  if (res.error) return res;
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  if (!id) redirect(`/admin/products/${savedId}`);
  return { ok: "Saved" };
}

export async function adjustStockAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin();
  const productId = str(fd, "productId");
  const res = await attempt(
    () => adjustStock(productId, str(fd, "size"), str(fd, "colour"), Number(str(fd, "delta"))),
    "Stock updated",
  );
  revalidatePath(`/admin/products/${productId}`);
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
  await requireAdmin();
  const res = await attempt(async () => {
    const data = settingsSchema.parse(Object.fromEntries(fd));
    await db.settings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  }, "Settings saved. New carts use them; existing carts keep their minimum.");
  revalidatePath("/admin/settings");
  return res;
}

export async function lockUserAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin();
  const userId = str(fd, "userId");
  const locked = str(fd, "locked") === "1";
  const res = await attempt(
    () => setUserLocked(userId, locked),
    locked ? "Locked and signed out everywhere" : "Unlocked: they can sign in again",
  );
  revalidatePath("/admin/users", "layout");
  return res;
}

export async function publishProductAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin();
  const productId = str(fd, "productId");
  const res = await attempt(() => publishProduct(productId));
  revalidatePath("/admin", "layout");
  revalidatePath("/shop");
  if (res.error) return res;
  // The review card goes away with the status, so say so on the reloaded page.
  redirect(`/admin/products/${productId}?reviewed=published`);
}

export async function returnProductAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin();
  const productId = str(fd, "productId");
  const res = await attempt(() => returnToSeller(productId, str(fd, "note")));
  revalidatePath("/admin", "layout");
  if (res.error) return res;
  redirect(`/admin/products/${productId}?reviewed=returned`);
}

export async function createSellerAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin();
  let id = "";
  const res = await attempt(async () => {
    id = (await createSeller(Object.fromEntries(fd))).id;
  });
  if (res.error) return res;
  revalidatePath("/admin/users");
  redirect(`/admin/users/${id}?created=1`);
}
