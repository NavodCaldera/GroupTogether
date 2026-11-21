"use server";

import { redirect } from "next/navigation";
import { parseItems } from "@/lib/cart-items";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { CartError } from "@/server/errors";
import { flash } from "@/server/flash";
import {
  closeOwnBasket,
  confirmOwnDelivery,
  answerJoinRequest,
  askToJoin,
  startOwnCheckout,
} from "@/server/orders/own-baskets";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** After paying: the gateway, or the order. The cart rows left in the payment's transaction. */
async function finish(result: { orderId: string; redirectUrl: string | null }) {
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
  const basketId = str(fd, "basketId");
  let result: Awaited<ReturnType<typeof startOwnCheckout>>;
  try {
    if (!items.length) throw new CartError("Choose items");
    if (!basketId) throw new CartError("Choose a basket");
    result = await startOwnCheckout(user.id, {
      ...(basketId === "new" && how === "mine"
        ? {
            create: {
              address: str(fd, "address"),
              area: str(fd, "area"),
              phone: str(fd, "phone"),
            },
          }
        : { basketId }),
      fromCart: items,
      tokens: str(fd, "tokens") || "0",
      requestKey: str(fd, "requestKey"),
    });
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    redirect(back(e.message));
  }
  await finish(result);
}

/** Where an owner step returns: the order page it was posted from, else Orders. */
function backOf(fd: FormData) {
  const back = str(fd, "back");
  return /^\/orders\/[A-Za-z0-9_-]+$/.test(back) ? back : "/orders";
}

async function ownerStep(fd: FormData, work: (userId: string, basketId: string) => Promise<void>) {
  const basketId = str(fd, "basketId");
  const back = backOf(fd);
  const user = await requireUser([...BUYER_ROLES], back);
  try {
    await work(user.id, basketId);
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    redirect(`${back}?${new URLSearchParams({ error: e.message })}`);
  }
  redirect(back);
}

export async function closeOwnBasketAction(fd: FormData) {
  await ownerStep(fd, (u, b) => closeOwnBasket(u, b));
}

export async function confirmDeliveryAction(fd: FormData) {
  await ownerStep(fd, (u, b) => confirmOwnDelivery(u, b));
}

/** From the cart: ask to join someone's basket with the ticked items (DEC-028). */
export async function askToJoinAction(fd: FormData) {
  const items = parseItems(str(fd, "items")) ?? [];
  const q = new URLSearchParams({ how: "join" });
  for (const id of items) q.append("sel", id);
  const user = await requireUser([...BUYER_ROLES], `/cart?${q}`);
  try {
    await askToJoin(user.id, str(fd, "basketId"), items);
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    q.set("error", e.message);
    redirect(`/cart?${q}`);
  }
  // The row's Asked badge is the confirmation.
  redirect(`/cart?${q}`);
}

/** The owner accepts or declines a join request, from the order page. */
export async function answerJoinAction(fd: FormData) {
  const back = /^\/orders\/[A-Za-z0-9_-]+$/.test(str(fd, "back")) ? str(fd, "back") : "/orders";
  const user = await requireUser([...BUYER_ROLES], back);
  try {
    await answerJoinRequest(user.id, str(fd, "requestId"), str(fd, "answer") === "accept");
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    redirect(`${back}?${new URLSearchParams({ error: e.message })}`);
  }
  redirect(back);
}
