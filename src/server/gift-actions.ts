"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireSeller, requireUser } from "./auth/session";
import { CatalogueError } from "./catalogue";
import { flash } from "./flash";
import {
  approveGiftBill,
  cancelReservedGift,
  recordGiftSettlement,
  reserveGift,
  updateGiftAvailability,
  updateGiftDelivery,
} from "./gifts";

type State = { error?: string };
const value = (fd: FormData, key: string) => String(fd.get(key) ?? "");

async function attempt(work: () => Promise<unknown>, message: string): Promise<State> {
  try {
    await work();
  } catch (e) {
    if (e instanceof CatalogueError) return { error: e.message };
    throw e;
  }
  revalidatePath("/seller");
  revalidatePath("/admin/brands");
  revalidatePath("/c/[code]", "page");
  await flash(message);
  return {};
}

export async function availabilityAction(_state: State, fd: FormData): Promise<State> {
  const user = await requireSeller();
  return attempt(
    () =>
      updateGiftAvailability(
        user.id,
        value(fd, "offerId"),
        Number(value(fd, "pieces")),
        fd.has("paused"),
      ),
    "Availability updated.",
  );
}

export async function giftDeliveryAction(_state: State, fd: FormData): Promise<State> {
  const user = await requireSeller();
  return attempt(
    () =>
      updateGiftDelivery(
        user.id,
        value(fd, "giftId"),
        value(fd, "event"),
        value(fd, "courier"),
        value(fd, "tracking"),
        value(fd, "issue"),
      ),
    "Gift order updated.",
  );
}

export async function reserveGiftAction(_state: State, fd: FormData): Promise<State> {
  const user = await requireAdmin();
  return attempt(
    () => reserveGift(user.id, value(fd, "cartId"), value(fd, "recipientId"), value(fd, "offerId")),
    "Gift reserved in basket.",
  );
}

export async function removeGiftAction(_state: State, fd: FormData): Promise<State> {
  const user = await requireUser(["ADMIN", "CUSTOMER"]);
  return attempt(
    () => cancelReservedGift(user.id, value(fd, "giftId")),
    "Gift removed. Quantity released.",
  );
}

export async function approveGiftBillAction(_state: State, fd: FormData): Promise<State> {
  const user = await requireAdmin();
  return attempt(() => approveGiftBill(user.id, value(fd, "giftId")), "Gift bill approved.");
}

export async function settleGiftsAction(_state: State, fd: FormData): Promise<State> {
  const user = await requireAdmin();
  return attempt(
    () =>
      recordGiftSettlement(
        user.id,
        value(fd, "brandId"),
        fd.getAll("giftIds").map(String),
        value(fd, "reference"),
      ),
    "Payment recorded.",
  );
}
