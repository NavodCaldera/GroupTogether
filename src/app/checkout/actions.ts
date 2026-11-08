"use server";

import { redirect } from "next/navigation";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { CartError } from "@/server/errors";
import { flash } from "@/server/flash";
import { startCheckout } from "@/server/orders/checkout";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Places the orders at the quoted token amount, then sends the buyer to the payment page. */
export async function payAction(fd: FormData) {
  const user = await requireUser([...BUYER_ROLES], "/checkout");
  const agentId = str(fd, "agentId");
  const tokens = str(fd, "quotedTokens") || "0";
  let result: Awaited<ReturnType<typeof startCheckout>>;
  try {
    result = await startCheckout(user.id, { agentId, tokens, requestKey: str(fd, "requestKey") });
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    const back = new URLSearchParams({ agentId, tokens, error: e.message });
    redirect(`/checkout?${back}`);
  }
  if (result.redirectUrl) redirect(result.redirectUrl);
  await flash("Paid");
  redirect(result.orderIds.length === 1 ? `/orders/${result.orderIds[0]}` : "/orders");
}
