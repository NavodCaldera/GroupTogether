"use server";
import { CartError } from "./carts/errors";
import { revalidatePath } from "next/cache";
import { requireUser } from "./auth/session";
import { hideProduct, removeFactory } from "./quality";
export type QualityState = { error?: string; ok?: string };
async function run(fd: FormData, kind: "product" | "factory"): Promise<QualityState> {
  const user = await requireUser(["ADMIN"]);
  try {
    const id = String(fd.get("id") ?? ""),
      reason = String(fd.get("reason") ?? "");
    if (kind === "product") await hideProduct(user.id, id, reason);
    else
      await removeFactory(
        user.id,
        id,
        reason,
        fd.get("holdEarnings") === "on",
        String(fd.get("note") ?? ""),
      );
    for (const path of ["/admin/factory/quality", "/shop", "/seller", "/account", "/notifications"])
      revalidatePath(path);
    revalidatePath("/c/[code]", "page");
    revalidatePath("/products/[id]", "page");
    return { ok: kind === "product" ? "Product hidden" : "Factory removed" };
  } catch (error) {
    if (error instanceof CartError) return { error: error.message };
    throw error;
  }
}
export async function hideProductAction(_p: QualityState, fd: FormData) {
  return run(fd, "product");
}
export async function removeFactoryAction(_p: QualityState, fd: FormData) {
  return run(fd, "factory");
}
