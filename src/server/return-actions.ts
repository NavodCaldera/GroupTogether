"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "./auth/session";
import { flash } from "./flash";
import { CartError } from "@/server/errors";
import { UploadError } from "./storage";
import { fileReturn, factoryDecide, postReturnMessage, adminDecide, markReceived } from "./returns";
import type { ReportReason } from "@/lib/quality-rules";
export type ReturnState = { error?: string };
export async function returnAction(_previous: ReturnState, fd: FormData): Promise<ReturnState> {
  const user = await requireUser(["CUSTOMER", "SELLER", "ADMIN"]);
  const text = (key: string) => String(fd.get(key) ?? "");
  try {
    const id = text("id"),
      op = text("op");
    if (op === "file")
      await fileReturn(user.id, id, {
        reason: text("reason") as ReportReason,
        fault: text("fault") as "FACTORY" | "BUYER",
        qty: Number(text("qty")),
        note: text("note"),
        photos: fd.getAll("photos").filter((p): p is File => p instanceof File && p.size > 0),
      });
    else if (op === "factory")
      await factoryDecide(user.id, id, text("decision") === "accept", undefined, text("note"));
    else if (op === "message") await postReturnMessage(user.id, id, text("body"));
    else if (op === "admin")
      await adminDecide(user.id, id, text("decision") === "accept", text("note"));
    else if (op === "received")
      await markReceived(user.id, id, text("restock") === "yes", text("note"));
    else throw new CartError("Unknown return action");
    await flash(op === "file" ? "Return requested" : "Return updated");
    for (const path of ["/seller/returns", "/admin/factory/returns", "/account", "/notifications"])
      revalidatePath(path);
    revalidatePath("/c/[code]", "page");
    revalidatePath("/admin/factory/returns/[id]", "page");
    return {};
  } catch (error) {
    if (error instanceof CartError || error instanceof UploadError) return { error: error.message };
    throw error;
  }
}
