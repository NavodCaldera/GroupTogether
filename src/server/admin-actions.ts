"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { AuthError, createOperationalAdmin, createSeller, setUserLocked } from "./auth/service";
import { requireAdmin, requireAnyAdmin } from "./auth/session";
import { assertManagesUser } from "./admin-users";
import { CartError } from "./errors";
import { CatalogueError, adjustStock, saveProduct, setProductHidden } from "./catalogue";
import { setCommission, SettingsError } from "./settings";
import { flash } from "./flash";
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

export async function saveProductAction(_p: AdminState, fd: FormData): Promise<AdminState> {
  await requireAdmin("FACTORY");
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
