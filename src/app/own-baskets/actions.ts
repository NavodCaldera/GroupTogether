"use server";

import { redirect } from "next/navigation";
import { parseItems } from "@/lib/cart-items";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { CartError } from "@/server/errors";
import { flash } from "@/server/flash";
import { cartLines, removeFromCart } from "@/server/orders/cart";
import {
  closeOwnBasket,
  confirmOwnDelivery,
  setOwnVisibility,
  startOwnCheckout,
  type OwnLineInput,
} from "@/server/orders/own-baskets";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Size quantities posted as qty-<variantId>. */
function linesOf(fd: FormData): OwnLineInput[] {
  const lines: OwnLineInput[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("qty-")) continue;
    const raw = String(v).trim();
    if (!raw) continue;
    const qty = /^\d{1,3}$/.test(raw) ? Number(raw) : -1;
    lines.push({ variantId: k.slice(4), qty });
  }
  return lines;
}

async function finish(
  userId: string,
  lines: OwnLineInput[],
  result: { orderId: string; redirectUrl: string | null },
) {
  // Like agent checkout, sizes ordered into a basket leave the cart.
  await removeFromCart(
    userId,
    lines.map((l) => l.variantId),
  );
  if (result.redirectUrl) redirect(result.redirectUrl);
  await flash("Paid");
  redirect(`/orders/${result.orderId}`);
}

/** From the cart (DEC-027): the ticked items go into one of the buyer's own baskets, a new one,
 * or someone's public basket of the same factory. The quantities are the cart's. */
export async function ownFromCartAction(fd: FormData) {
  const items = parseItems(str(fd, "items")) ?? [];
  const how = str(fd, "how") === "join" ? "join" : "mine";
  const back = (error?: string) => {
    const q = new URLSearchParams({ how });
    for (const id of items) q.append("sel", id);
    if (error) q.set("error", error);
    return `/cart?${q}`;
  };
  const user = await requireUser([...BUYER_ROLES], back());
  const lines = items.length ? await cartLines(user.id, items) : [];
  const basketId = str(fd, "basketId");
  let result: Awaited<ReturnType<typeof startOwnCheckout>>;
  try {
    if (!lines.length) throw new CartError("Choose items");
    if (!basketId) throw new CartError("Choose a basket");
    result = await startOwnCheckout(user.id, {
      ...(basketId === "new" && how === "mine"
        ? {
            create: {
              visibility: str(fd, "visibility") === "PUBLIC" ? "PUBLIC" : "LINK",
              address: str(fd, "address"),
              area: str(fd, "area"),
              phone: str(fd, "phone"),
            },
          }
        : { basketId }),
      lines,
      tokens: str(fd, "tokens") || "0",
      requestKey: str(fd, "requestKey"),
    });
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    redirect(back(e.message));
  }
  await finish(user.id, lines, result);
}

/** Buys sizes of the basket's products into someone's own basket (from its share link). */
export async function joinOwnBasketAction(fd: FormData) {
  const basketId = str(fd, "basketId");
  const code = str(fd, "code");
  const back = `/own-baskets/${basketId}${code ? `?code=${encodeURIComponent(code)}` : ""}`;
  const user = await requireUser([...BUYER_ROLES], back);
  const lines = linesOf(fd);
  let result: Awaited<ReturnType<typeof startOwnCheckout>>;
  try {
    result = await startOwnCheckout(user.id, {
      basketId,
      shareCode: code || undefined,
      lines,
      tokens: str(fd, "tokens") || "0",
      requestKey: str(fd, "requestKey"),
    });
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    const q = new URLSearchParams({ error: e.message, ...(code ? { code } : {}) });
    redirect(`/own-baskets/${basketId}?${q}`);
  }
  await finish(user.id, lines, result);
}

/** Where an owner step returns: the order page it was posted from, else the basket page. */
function backOf(fd: FormData, basketId: string) {
  const back = str(fd, "back");
  return /^\/orders\/[A-Za-z0-9_-]+$/.test(back) ? back : `/own-baskets/${basketId}`;
}

async function ownerStep(fd: FormData, work: (userId: string, basketId: string) => Promise<void>) {
  const basketId = str(fd, "basketId");
  const back = backOf(fd, basketId);
  const user = await requireUser([...BUYER_ROLES], back);
  try {
    await work(user.id, basketId);
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    redirect(`${back}?${new URLSearchParams({ error: e.message })}`);
  }
  redirect(back);
}

export async function setVisibilityAction(fd: FormData) {
  await ownerStep(fd, (u, b) =>
    setOwnVisibility(u, b, str(fd, "visibility") === "PUBLIC" ? "PUBLIC" : "LINK"),
  );
}

export async function closeOwnBasketAction(fd: FormData) {
  await ownerStep(fd, (u, b) => closeOwnBasket(u, b));
}

export async function confirmDeliveryAction(fd: FormData) {
  await ownerStep(fd, (u, b) => confirmOwnDelivery(u, b));
}
