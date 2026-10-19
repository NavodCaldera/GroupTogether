"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePacker } from "./auth/session";
import { CartError } from "./carts/service";
import { handOver, markGathered, markPacked, sendBack } from "./packing";

export type PackingState = { error?: string };

/**
 * Runs one packing step. On success the form's stage is gone from the page, so it goes on to
 * `next`, where a pop-up says what happened (`?done=`).
 */
async function step(fn: () => Promise<unknown>, next: string): Promise<PackingState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof CartError) return { error: e.message };
    throw e;
  }
  revalidatePath("/packing", "layout");
  redirect(next);
}

const field = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const codeOf = (fd: FormData) => encodeURIComponent(field(fd, "code"));

/** The gatherer is done with the order (someone else packs it): back to the list. */
export async function gatheredAction(_p: PackingState, fd: FormData): Promise<PackingState> {
  const staff = await requirePacker();
  return step(
    () => markGathered(staff.id, field(fd, "cartId")),
    `/packing?done=gathered&cart=${codeOf(fd)}`,
  );
}

/** Rechecked and packed by a second person: stays on the order, ready for PickMe. */
export async function packedAction(_p: PackingState, fd: FormData): Promise<PackingState> {
  const staff = await requirePacker();
  return step(
    () => markPacked(staff.id, field(fd, "cartId")),
    `/packing/${codeOf(fd)}?done=packed`,
  );
}

export async function sendBackAction(_p: PackingState, fd: FormData): Promise<PackingState> {
  await requirePacker();
  return step(() => sendBack(field(fd, "cartId")), `/packing/${codeOf(fd)}?done=sent-back`);
}

export async function handedOverAction(_p: PackingState, fd: FormData): Promise<PackingState> {
  const staff = await requirePacker();
  return step(
    () => handOver(staff.id, field(fd, "cartId")),
    `/packing?done=handed&cart=${codeOf(fd)}`,
  );
}
