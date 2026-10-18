"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePacker } from "./auth/session";
import { CartError } from "./carts/service";
import { checkPacking, handOver, markPacked, repack } from "./packing";

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

export async function packedAction(_p: PackingState, fd: FormData): Promise<PackingState> {
  const staff = await requirePacker();
  return step(
    () => markPacked(staff.id, field(fd, "cartId")),
    `/packing/${codeOf(fd)}?done=packed`,
  );
}

/** After checking, the checker is done with the order: back to the list. */
export async function checkedAction(_p: PackingState, fd: FormData): Promise<PackingState> {
  const staff = await requirePacker();
  return step(
    () => checkPacking(staff.id, field(fd, "cartId")),
    `/packing?done=checked&cart=${codeOf(fd)}`,
  );
}

export async function repackAction(_p: PackingState, fd: FormData): Promise<PackingState> {
  await requirePacker();
  return step(() => repack(field(fd, "cartId")), `/packing/${codeOf(fd)}?done=repack`);
}

export async function handedOverAction(_p: PackingState, fd: FormData): Promise<PackingState> {
  const staff = await requirePacker();
  return step(
    () => handOver(staff.id, field(fd, "cartId")),
    `/packing?done=handed&cart=${codeOf(fd)}`,
  );
}
