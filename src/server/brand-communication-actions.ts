"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "./auth/session";
import { CatalogueError } from "./catalogue";
import { flash } from "./flash";
import { markBrandThreadRead, resolveBrandThread, sendBrandMessage } from "./brand-communications";
import { reviewBrandOffer } from "./brand-reviews";
import { acknowledgeGift, respondToSettlement } from "./gifts";
type State = { error?: string; thread?: string; admin?: boolean };
const val = (fd: FormData, key: string) => String(fd.get(key) ?? "");
function invalidate() {
  revalidatePath("/admin/brands");
  revalidatePath("/seller");
  revalidatePath("/notifications");
}
async function attempt(work: () => Promise<unknown>, message: string): Promise<State> {
  try {
    await work();
  } catch (error) {
    if (error instanceof CatalogueError) return { error: error.message };
    throw error;
  }
  invalidate();
  await flash(message);
  return {};
}
export async function sendBrandMessageAction(_state: State, fd: FormData): Promise<State> {
  const user = await requireUser(["ADMIN", "SELLER"]);
  let thread: string;
  try {
    thread = await sendBrandMessage(user.id, {
      thread: val(fd, "thread") || undefined,
      brandId: val(fd, "brandId"),
      kind: val(fd, "kind"),
      subjectId: val(fd, "subjectId"),
      body: val(fd, "body"),
      internal: fd.has("internal"),
      requestKey: val(fd, "requestKey"),
    });
  } catch (error) {
    if (error instanceof CatalogueError) return { error: error.message };
    throw error;
  }
  invalidate();
  return { thread, admin: user.role === "ADMIN" };
}
export async function readBrandThreadAction(thread: string, through: string) {
  const user = await requireUser(["ADMIN", "SELLER"]);
  const date = new Date(through);
  if (!Number.isNaN(date.getTime()) && date <= new Date())
    await markBrandThreadRead(user.id, thread, date);
}
export async function resolveBrandThreadAction(_state: State, fd: FormData) {
  const user = await requireUser(["ADMIN", "SELLER"]);
  return attempt(
    () => resolveBrandThread(user.id, val(fd, "thread"), val(fd, "resolved") === "1"),
    "Conversation updated.",
  );
}
export async function reviewBrandOfferAction(_state: State, fd: FormData) {
  const user = await requireAdmin("PREMIUM");
  return attempt(
    () =>
      reviewBrandOffer(
        user.id,
        val(fd, "offerId"),
        Number(val(fd, "version")),
        val(fd, "decision"),
        val(fd, "note"),
      ),
    "Review recorded.",
  );
}
export async function acknowledgeGiftAction(_state: State, fd: FormData) {
  const user = await requireUser(["SELLER"]);
  return attempt(() => acknowledgeGift(user.id, val(fd, "giftId")), "Gift order acknowledged.");
}
export async function settlementResponseAction(_state: State, fd: FormData) {
  const user = await requireUser(["ADMIN", "SELLER"]);
  return attempt(
    () => respondToSettlement(user.id, val(fd, "settlementId"), val(fd, "event"), val(fd, "note")),
    "Settlement updated.",
  );
}
