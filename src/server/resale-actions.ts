"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { phoneSchema } from "./auth/service";
import { requireUser } from "./auth/session";
import { AppError } from "./errors";
import { flash } from "./flash";
import {
  addContact,
  cancelListing,
  cancelReservation,
  completeReservation,
  createListing,
  removeContact,
  reserve,
} from "./resale";

export type ResaleState = { error?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function run(
  next: string,
  work: (userId: string) => Promise<unknown>,
  done: string,
  to: string = next,
): Promise<ResaleState> {
  const user = await requireUser(next);
  try {
    await work(user.id);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  await flash(done);
  revalidatePath(to);
  redirect(to);
}

export async function listAction(_p: ResaleState, fd: FormData): Promise<ResaleState> {
  const groupId = str(fd, "groupId");
  return run(
    `/purchases/${groupId}`,
    (id) =>
      createListing(id, {
        groupId,
        itemId: str(fd, "itemId"),
        qty: Number(str(fd, "qty")),
        audience: str(fd, "audience"),
        spot: str(fd, "spot"),
        unopened: fd.get("unopened") === "on",
      }),
    "Listed for resale",
  );
}

export async function reserveAction(_p: ResaleState, fd: FormData): Promise<ResaleState> {
  const listingId = str(fd, "listingId");
  return run(
    `/reselling/${listingId}`,
    (id) => reserve(id, listingId, Number(str(fd, "qty"))),
    "Reserved",
  );
}

export async function completeAction(_p: ResaleState, fd: FormData): Promise<ResaleState> {
  return run("/reselling/mine", (id) => completeReservation(id, str(fd, "id")), "Handed over");
}

export async function cancelReservationAction(_p: ResaleState, fd: FormData): Promise<ResaleState> {
  const back = str(fd, "back").startsWith("/reselling/") ? str(fd, "back") : "/reselling/mine";
  return run(back, (id) => cancelReservation(id, str(fd, "id")), "Reservation cancelled");
}

export async function cancelListingAction(_p: ResaleState, fd: FormData): Promise<ResaleState> {
  return run("/reselling/mine", (id) => cancelListing(id, str(fd, "id")), "Listing cancelled");
}

export async function addContactAction(_p: ResaleState, fd: FormData): Promise<ResaleState> {
  const phone = phoneSchema.safeParse(str(fd, "phone"));
  if (!phone.success) return { error: phone.error.issues[0].message };
  return run("/account", (id) => addContact(id, phone.data), "Contact saved");
}

export async function removeContactAction(_p: ResaleState, fd: FormData): Promise<ResaleState> {
  return run("/account", (id) => removeContact(id, str(fd, "phone")), "Contact removed");
}
