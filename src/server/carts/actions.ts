"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "../auth/session";
import { db } from "../db";
import { UploadError } from "../storage";
import { inviteToCart } from "./invites";
import {
  CartError,
  acceptAndPay,
  cancelCart,
  createCart,
  joinCart,
  leaveCart,
  setLine,
} from "./service";
import { uploadSlip } from "./slips";

export type ActionState = { error?: string; ok?: string };

/** Expected failures become a message on the form; anything else is a real error. */
async function attempt(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    return ok ? { ok } : {};
  } catch (e) {
    if (e instanceof CartError || e instanceof UploadError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function cartCode(cartId: string) {
  const c = await db.groupCart.findUnique({ where: { id: cartId }, select: { code: true } });
  if (!c) throw new CartError("Cart not found");
  return c.code;
}

export async function createCartAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser([], "/carts/new");
  let code = "";
  const res = await attempt(async () => {
    const cart = await createCart(user.id, {
      name: str(fd, "name"),
      visibility: str(fd, "visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    });
    code = cart.code;
  });
  if (res.error) return res;
  redirect(`/c/${code}`);
}

/** Product page: add a size to one of your carts, or start a new cart with it. */
export async function addToCartAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const productId = str(fd, "productId");
  const user = await requireUser([], `/products/${productId}`);
  const variantId = str(fd, "variantId");
  const qty = Number(str(fd, "qty") || "1");
  let target = str(fd, "cartId");
  let code = "";
  const res = await attempt(async () => {
    if (!variantId) throw new CartError("Choose a size");
    if (target === "new") {
      const cart = await createCart(user.id, {
        name: str(fd, "name"),
        visibility: str(fd, "visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      });
      target = cart.id;
    }
    if (!target) throw new CartError("Choose a cart");
    await setLine(user.id, target, variantId, qty, { add: true });
    code = await cartCode(target);
  });
  if (res.error) return res;
  redirect(`/c/${code}?added=1`);
}

export async function updateLineAction(fd: FormData) {
  const user = await requireUser();
  const cartId = str(fd, "cartId");
  const res = await attempt(() =>
    setLine(user.id, cartId, str(fd, "variantId"), Number(str(fd, "qty"))).then(() => {}),
  );
  const code = await cartCode(cartId);
  revalidatePath(`/c/${code}`);
  if (res.error) redirect(`/c/${code}?error=${encodeURIComponent(res.error)}`);
}

export async function joinAction(fd: FormData) {
  const cartId = str(fd, "cartId");
  const code = await cartCode(cartId);
  const user = await requireUser([], `/c/${code}`);
  const res = await attempt(() => joinCart(user.id, cartId));
  if (res.error) redirect(`/c/${code}?error=${encodeURIComponent(res.error)}`);
  redirect(`/shop?cart=${code}`);
}

export async function leaveAction(fd: FormData) {
  const user = await requireUser();
  const cartId = str(fd, "cartId");
  const code = await cartCode(cartId);
  const res = await attempt(() => leaveCart(user.id, cartId));
  if (res.error) redirect(`/c/${code}?error=${encodeURIComponent(res.error)}`);
  redirect("/my-carts");
}

export async function acceptAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const cartId = str(fd, "cartId");
  const res = await attempt(async () => {
    await acceptAndPay(user.id, cartId, {
      deliveryAddress: str(fd, "deliveryAddress"),
      deliveryCity: str(fd, "deliveryCity"),
      deliveryPhone: str(fd, "deliveryPhone"),
    });
  });
  if (res.error) return res;
  redirect(`/c/${await cartCode(cartId)}/pay`);
}

export async function cancelAction(fd: FormData) {
  const user = await requireUser();
  const cartId = str(fd, "cartId");
  const code = await cartCode(cartId);
  const res = await attempt(() => cancelCart(user, cartId, str(fd, "reason")));
  if (res.error) redirect(`/c/${code}?error=${encodeURIComponent(res.error)}`);
  revalidatePath(`/c/${code}`);
}

export async function inviteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return attempt(async () => {
    const name = await inviteToCart(user.id, str(fd, "cartId"), str(fd, "contact"));
    return `Invite sent to ${name}`;
  });
}

export async function uploadSlipAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const cartId = str(fd, "cartId");
  const file = fd.get("slip");
  const res = await attempt(() => uploadSlip(user.id, cartId, file instanceof File ? file : null));
  if (res.error) return res;
  redirect(`/c/${await cartCode(cartId)}?paid=1`);
}

export async function markAllReadAction() {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}
