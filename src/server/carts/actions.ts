"use server";

import { applyTokens } from "../tokens";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "../auth/session";
import { db } from "../db";
import { locationSchema } from "@/lib/location";
import { UploadError } from "../storage";
import { sendMessage } from "./chat";
import { inviteToCart } from "./invites";
import {
  markDone,
  undoDone,
  removeMember,
  CartError,
  acceptAndPay,
  cancelCart,
  acceptMerge,
  cancelMerge,
  createCart,
  declineMerge,
  joinCart,
  leaveCart,
  requestMerge,
  setLine,
} from "./service";
import { uploadSlip } from "./slips";
import { markReceived } from "../delivery";
import { rateProduct } from "../ratings";
import type { ReportReason } from "@/lib/quality-rules";
import { flash } from "../flash";

export type ActionState = {
  error?: string;
  ok?: string;
  /** Cart code, after adding to it */
  code?: string;
  /** When it happened, so the same message can pop up again */
  at?: number;
};

/** Expected failures become a message on the form; anything else is a real error. */
async function attempt(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const ok = await fn();
    return ok ? { ok, at: Date.now() } : {};
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

/** Joining or starting a cart needs the buyer's address pinned on the map (saved on their profile). */
function needsPin(user: { lat: number | null }, next: string) {
  if (user.lat == null) redirect(`/account?next=${encodeURIComponent(next)}`);
}

export async function createCartAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser([], "/carts/new");
  needsPin(user, "/carts/new");
  let code = "";
  const res = await attempt(async () => {
    const cart = await createCart(user.id, {
      visibility: str(fd, "visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    });
    code = cart.code;
  });
  if (res.error) return res;
  await flash("Cart started. Add items to fill it.");
  redirect(`/c/${code}`);
}

/** Product page: add a size to one of your carts, or start a new cart with it. Stays on the page. */
export async function addToCartAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const productId = str(fd, "productId");
  const user = await requireUser([], `/products/${productId}`);
  needsPin(user, `/products/${productId}`);
  const variantId = str(fd, "variantId");
  const qty = Number(str(fd, "qty") || "1");
  let target = str(fd, "cartId");
  let code = "";
  const res = await attempt(async () => {
    if (!variantId) throw new CartError("Choose a size");
    if (target === "new") {
      const cart = await createCart(user.id, {
        visibility: str(fd, "visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      });
      target = cart.id;
    }
    if (!target) throw new CartError("Choose a cart");
    await setLine(user.id, target, variantId, qty, { add: true });
    code = await cartCode(target);
  });
  if (res.error) return res;
  // Stay on the product page: refresh its stock and cart list, and say where it went.
  revalidatePath(`/products/${productId}`);
  return { ok: "Added to your cart", code, at: Date.now() };
}

export async function updateLineAction(fd: FormData) {
  const user = await requireUser();
  const cartId = str(fd, "cartId");
  const qty = Number(str(fd, "qty"));
  const res = await attempt(() =>
    setLine(user.id, cartId, str(fd, "variantId"), qty).then(() => {}),
  );
  const code = await cartCode(cartId);
  revalidatePath(`/c/${code}`);
  if (res.error) redirect(`/c/${code}?error=${encodeURIComponent(res.error)}`);
  await flash(qty === 0 ? "Removed from the cart" : "Quantity updated");
}

/** Join with an address and a mandatory map pin. */
export async function joinAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const cartId = str(fd, "cartId");
  const code = await cartCode(cartId);
  const user = await requireUser([], `/c/${code}`);
  const res = await attempt(async () => {
    const location = locationSchema.parse(Object.fromEntries(fd));
    await joinCart(user.id, cartId, location);
  });
  if (res.error) return res;
  await flash("You joined the cart. Add your items.");
  redirect(`/shop?cart=${code}`);
}

export async function leaveAction(fd: FormData) {
  const user = await requireUser();
  const cartId = str(fd, "cartId");
  const code = await cartCode(cartId);
  const res = await attempt(() => leaveCart(user.id, cartId));
  if (res.error) redirect(`/c/${code}?error=${encodeURIComponent(res.error)}`);
  await flash("You left the cart");
  redirect("/my-carts");
}

export async function acceptAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const cartId = str(fd, "cartId");
  // The drop-off is the owner's profile address and phone; they change it on /account.
  let confirmed = false;
  const res = await attempt(async () => {
    if (!user.address || !user.city || !user.phone)
      throw new CartError("Add your address and mobile number in your profile first");
    const cart = await acceptAndPay(user.id, cartId, {
      deliveryAddress: user.address,
      deliveryCity: user.city,
      deliveryPhone: user.phone,
    });
    confirmed = cart.status === "CONFIRMED";
  });
  if (res.error) return res;
  await flash(confirmed ? "Group order confirmed" : "Cart accepted. Now upload your bank slip.");
  redirect(`/c/${await cartCode(cartId)}${confirmed ? "" : "/pay"}`);
}

export async function cancelAction(fd: FormData) {
  const user = await requireUser();
  const cartId = str(fd, "cartId");
  const code = await cartCode(cartId);
  const res = await attempt(() => cancelCart(user, cartId, str(fd, "reason")));
  if (res.error) redirect(`/c/${code}?error=${encodeURIComponent(res.error)}`);
  revalidatePath(`/c/${code}`);
  await flash("Cart cancelled");
}

/** The owner confirms the PickMe drop reached them (dashboard). */
export async function markReceivedAction(fd: FormData) {
  const user = await requireUser();
  const res = await attempt(() => markReceived(user.id, str(fd, "cartId")));
  if (res.error) redirect(`/dashboard?error=${encodeURIComponent(res.error)}`);
  revalidatePath("/dashboard");
  redirect("/dashboard?received=1");
}

/** Chat with a cart's owner (or, for the owner, with the person who wrote). */
export async function sendMessageAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return attempt(async () => {
    await sendMessage(user.id, str(fd, "cartId"), str(fd, "body"), str(fd, "with") || undefined);
  });
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
  await flash("All marked as read");
}

// ─── Merge into a friend's cart (the owner there must accept) ─────────────

async function mergeStep(
  fd: FormData,
  codeOf: (fd: FormData) => Promise<string>,
  run: (userId: string, id: string) => Promise<unknown>,
  idKey: string,
  /** The pop-up on the cart page afterwards */
  done: string,
) {
  const code = await codeOf(fd);
  const user = await requireUser([], `/c/${code}`);
  const res = await attempt(async () => {
    await run(user.id, str(fd, idKey));
  });
  revalidatePath(`/c/${code}`);
  revalidatePath("/notifications");
  // Answering from Notifications: mark that notice read and stay there.
  if (str(fd, "back") === "/notifications") {
    if (!res.error)
      await db.notification.updateMany({
        where: {
          userId: user.id,
          href: { startsWith: `/c/${code}` },
          title: { contains: "wants to join" },
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    redirect(
      res.error
        ? `/notifications?error=${encodeURIComponent(res.error)}`
        : `/notifications?done=${idKey === "requestId" ? str(fd, "verdict") : "1"}`,
    );
  }
  if (res.error) redirect(`/c/${code}?error=${encodeURIComponent(res.error)}`);
  await flash(done);
  redirect(`/c/${code}`);
}

const codeFromCart = (fd: FormData) => cartCode(str(fd, "cartId"));
async function codeFromRequest(fd: FormData) {
  const r = await db.cartMergeRequest.findUnique({
    where: { id: str(fd, "requestId") },
    select: { toCart: { select: { code: true } } },
  });
  if (!r) throw new CartError("This request no longer exists");
  return r.toCart.code;
}

export async function requestMergeAction(fd: FormData) {
  await mergeStep(fd, codeFromCart, requestMerge, "cartId", "Request sent. The owner will answer.");
}
export async function acceptMergeAction(fd: FormData) {
  await mergeStep(
    fd,
    codeFromRequest,
    acceptMerge,
    "requestId",
    "Accepted. Their items are now in your cart.",
  );
}
export async function declineMergeAction(fd: FormData) {
  await mergeStep(fd, codeFromRequest, declineMerge, "requestId", "Declined");
}
export async function cancelMergeAction(fd: FormData) {
  await mergeStep(fd, codeFromRequest, cancelMerge, "requestId", "Request cancelled");
}

/** A member rates the factory of their delivered group order, 1–5 stars (2026-11-03). */
export async function rateProductAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["CUSTOMER"]);
  const result = await attempt(async () => {
    const reason = str(fd, "reason");
    const photos = fd.getAll("photos").filter((v): v is File => v instanceof File && v.size > 0);
    await rateProduct(
      user.id,
      str(fd, "orderId"),
      str(fd, "productId"),
      Number(str(fd, "stars")),
      reason ? { reason: reason as ReportReason, note: str(fd, "note"), photos } : undefined,
    );
    return "Rating saved";
  });
  revalidatePath("/c/[code]", "page");
  revalidatePath("/shop");
  revalidatePath("/products/[id]", "page");
  return result;
}

export async function applyTokensAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser(["CUSTOMER"], "/account");
  return attempt(async () => {
    const lineId = str(fd, "lineId"),
      requestKey = str(fd, "requestKey");
    if (!requestKey) throw new CartError("Invalid token request");
    await applyTokens(user.id, lineId, str(fd, "amount"), requestKey);
    revalidatePath("/c/[code]", "page");
    revalidatePath("/account");
    revalidatePath("/dashboard");
    return "Tokens applied";
  });
}

async function memberDoneAction(
  fd: FormData,
  operation: "done" | "undo" | "remove",
): Promise<ActionState> {
  const user = await requireUser(["CUSTOMER"]);
  const cartId = str(fd, "cartId");
  return attempt(async () => {
    if (operation === "done") await markDone(user.id, cartId);
    else if (operation === "undo") await undoDone(user.id, cartId);
    else await removeMember(user.id, cartId, str(fd, "memberId"));
    revalidatePath(`/c/${await cartCode(cartId)}`);
    revalidatePath("/notifications");
  });
}
export async function markDoneAction(_p: ActionState, fd: FormData) {
  return memberDoneAction(fd, "done");
}
export async function undoDoneAction(_p: ActionState, fd: FormData) {
  return memberDoneAction(fd, "undo");
}
export async function removeMemberAction(_p: ActionState, fd: FormData) {
  return memberDoneAction(fd, "remove");
}
