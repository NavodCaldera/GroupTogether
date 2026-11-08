"use server";

import { revalidatePath } from "next/cache";
import { requireFactory } from "@/server/auth/session";
import { CartError } from "@/server/errors";
import { flash } from "@/server/flash";
import { givenToDriver, markPacked, reportMissing } from "@/server/orders/delivery";

export type BasketActionState = { error?: string };

/** Runs a packing step for the signed-in Owner or Packing login; the service re-checks the job. */
async function step(work: (userId: string) => Promise<void>, done: string) {
  const me = await requireFactory("orders");
  try {
    await work(me.id);
  } catch (e) {
    if (e instanceof CartError) return { error: e.message };
    throw e;
  }
  revalidatePath("/seller");
  revalidatePath("/seller/orders");
  revalidatePath("/admin/agents");
  await flash(done);
  return {};
}

export async function markPackedAction(
  _p: BasketActionState,
  fd: FormData,
): Promise<BasketActionState> {
  const basketId = String(fd.get("basketId") ?? "");
  return step((userId) => markPacked(userId, basketId), "Packed");
}

export async function givenToDriverAction(
  _p: BasketActionState,
  fd: FormData,
): Promise<BasketActionState> {
  const basketId = String(fd.get("basketId") ?? "");
  return step((userId) => givenToDriver(userId, basketId), "Given to driver");
}

export async function reportMissingAction(
  _p: BasketActionState,
  fd: FormData,
): Promise<BasketActionState> {
  const lineId = String(fd.get("lineId") ?? "");
  const qty = Number(fd.get("qty"));
  const note = String(fd.get("note") ?? "");
  return step((userId) => reportMissing(userId, lineId, qty, note), "Missing reported");
}
