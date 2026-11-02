"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireAdmin, requireUser } from "./auth/session";
import { CartError } from "./carts/service";
import { flash } from "./flash";
import { acceptSampleTransport, requestSample, updateSample } from "./samples";
type State = { error?: string };
const value = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
async function attempt(fn: () => Promise<unknown>): Promise<State> {
  try {
    await fn();
    await flash("Sample request updated");
  } catch (e) {
    if (e instanceof CartError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
  revalidatePath("/samples");
  revalidatePath("/admin/warehouse");
  return {};
}
export async function requestSampleAction(_p: State, fd: FormData) {
  const user = await requireUser(["CUSTOMER"], "/samples");
  return attempt(() =>
    requestSample(user.id, {
      cartId: value(fd, "cartId"),
      productId: value(fd, "productId"),
      designNote: value(fd, "designNote"),
    }),
  );
}
export async function acceptSampleAction(_p: State, fd: FormData) {
  const user = await requireUser(["CUSTOMER"], "/samples");
  return attempt(() =>
    acceptSampleTransport(user.id, value(fd, "id"), value(fd, "expectedTransportFee")),
  );
}
export async function updateSampleAction(_p: State, fd: FormData) {
  const admin = await requireAdmin("WAREHOUSE");
  return attempt(() =>
    updateSample(admin.id, {
      id: value(fd, "id"),
      status: value(fd, "status"),
      transportFee: value(fd, "transportFee") || undefined,
      courier: value(fd, "courier"),
      tracking: value(fd, "tracking"),
      note: value(fd, "note"),
    }),
  );
}
