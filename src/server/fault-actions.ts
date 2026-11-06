"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "./auth/session";
import { flash } from "./flash";
import { CartError } from "./carts/errors";
import { decideHold, cancelFault, postHoldMessage } from "./fault-holds";
export async function faultAction(
  _previous: { error?: string },
  fd: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser(["SELLER", "ADMIN"]),
    text = (key: string) => String(fd.get(key) ?? "");
  try {
    const op = text("op"),
      id = text("id");
    if (op === "message") await postHoldMessage(user.id, id, text("body"));
    else if (op === "decide")
      await decideHold(user.id, id, text("decision") as "CONTINUE" | "REMOVE", text("note"));
    else if (op === "cancel") await cancelFault(user.id, id, text("note"));
    else throw new CartError("Unknown fault action");
    await flash("Updated");
    for (const path of [
      "/seller/returns",
      "/admin/factory/quality",
      "/admin/factory/returns",
      "/shop",
      "/notifications",
    ])
      revalidatePath(path);
    return {};
  } catch (error) {
    if (error instanceof CartError) return { error: error.message };
    throw error;
  }
}
