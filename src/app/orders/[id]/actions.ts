"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReportReason } from "@/lib/quality-rules";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { CartError } from "@/server/errors";
import { flash } from "@/server/flash";
import { cancelOrder } from "@/server/orders/baskets";
import { rateProduct } from "@/server/ratings";
import { fileReturn } from "@/server/returns";
import { UploadError } from "@/server/storage";

type State = { error?: string };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const photos = (fd: FormData) =>
  fd.getAll("photos").filter((p): p is File => p instanceof File && p.size > 0);

function refresh() {
  revalidatePath("/orders/[id]", "page");
  revalidatePath("/orders");
  revalidatePath("/");
}

async function attempt(fn: () => Promise<void>, ok: string): Promise<State> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof CartError || e instanceof UploadError) return { error: e.message };
    throw e;
  }
  await flash(ok);
  refresh();
  return {};
}

/** Cancels a paid order while its basket is OPEN; everything paid comes back as tokens. */
export async function cancelOrderAction(fd: FormData) {
  const user = await requireUser([...BUYER_ROLES], "/orders");
  const orderId = str(fd, "orderId");
  try {
    await cancelOrder(user.id, orderId);
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    redirect(`/orders/${encodeURIComponent(orderId)}?error=${encodeURIComponent(e.message)}`);
  }
  await flash("Order cancelled");
  refresh();
}

/** `id` is the order line; the service checks it is the buyer's and inside the window. */
export async function fileReturnAction(_p: State, fd: FormData): Promise<State> {
  const user = await requireUser([...BUYER_ROLES], "/orders");
  return attempt(
    () =>
      fileReturn(user.id, str(fd, "id"), {
        reason: str(fd, "reason") as ReportReason,
        fault: str(fd, "fault") as "FACTORY" | "BUYER",
        qty: Number(str(fd, "qty")),
        note: str(fd, "note"),
        photos: photos(fd),
      }).then(() => undefined),
    "Return requested",
  );
}

export async function rateAction(_p: State, fd: FormData): Promise<State> {
  const user = await requireUser([...BUYER_ROLES], "/orders");
  const reason = str(fd, "reason");
  const result = await attempt(
    () =>
      rateProduct(
        user.id,
        str(fd, "orderId"),
        str(fd, "productId"),
        Number(str(fd, "stars")),
        reason
          ? { reason: reason as ReportReason, note: str(fd, "note"), photos: photos(fd) }
          : undefined,
      ),
    "Rating saved",
  );
  if (!result.error) {
    revalidatePath("/shop");
    revalidatePath("/products/[id]", "page");
  }
  return result;
}
