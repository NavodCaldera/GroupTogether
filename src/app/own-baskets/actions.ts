"use server";

import { redirect } from "next/navigation";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { CartError } from "@/server/errors";
import { flash } from "@/server/flash";
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

async function finish(result: { basketId: string; redirectUrl: string | null }) {
  if (result.redirectUrl) redirect(result.redirectUrl);
  await flash("Paid");
  redirect(`/own-baskets/${result.basketId}`);
}

/** Starts an own basket with the owner's first order (DEC-023). */
export async function startOwnBasketAction(fd: FormData) {
  const productId = str(fd, "productId");
  const user = await requireUser([...BUYER_ROLES], `/own-baskets/new?product=${productId}`);
  let result: Awaited<ReturnType<typeof startOwnCheckout>>;
  try {
    result = await startOwnCheckout(user.id, {
      create: {
        productId,
        visibility: str(fd, "visibility") === "PUBLIC" ? "PUBLIC" : "LINK",
        address: str(fd, "address"),
        area: str(fd, "area"),
        phone: str(fd, "phone"),
      },
      lines: linesOf(fd),
      tokens: str(fd, "tokens") || "0",
      requestKey: str(fd, "requestKey"),
    });
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    redirect(`/own-baskets/new?${new URLSearchParams({ product: productId, error: e.message })}`);
  }
  await finish(result);
}

/** Buys the same product into someone's own basket. */
export async function joinOwnBasketAction(fd: FormData) {
  const basketId = str(fd, "basketId");
  const code = str(fd, "code");
  const back = `/own-baskets/${basketId}${code ? `?code=${encodeURIComponent(code)}` : ""}`;
  const user = await requireUser([...BUYER_ROLES], back);
  let result: Awaited<ReturnType<typeof startOwnCheckout>>;
  try {
    result = await startOwnCheckout(user.id, {
      basketId,
      shareCode: code || undefined,
      lines: linesOf(fd),
      tokens: str(fd, "tokens") || "0",
      requestKey: str(fd, "requestKey"),
    });
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    const q = new URLSearchParams({ error: e.message, ...(code ? { code } : {}) });
    redirect(`/own-baskets/${basketId}?${q}`);
  }
  await finish(result);
}

async function ownerStep(fd: FormData, work: (userId: string, basketId: string) => Promise<void>) {
  const basketId = str(fd, "basketId");
  const user = await requireUser([...BUYER_ROLES], `/own-baskets/${basketId}`);
  try {
    await work(user.id, basketId);
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    redirect(`/own-baskets/${basketId}?${new URLSearchParams({ error: e.message })}`);
  }
  redirect(`/own-baskets/${basketId}`);
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
