"use server";

import { revalidatePath } from "next/cache";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { CartError } from "@/server/carts/errors";
import { transferTokens } from "@/server/tokens";

export type SendState = { error?: string; ok?: string; at?: number };

export async function sendTokensAction(_p: SendState, fd: FormData): Promise<SendState> {
  const user = await requireUser([...BUYER_ROLES], "/tokens");
  try {
    await transferTokens(
      user.id,
      String(fd.get("to") ?? ""),
      String(fd.get("amount") ?? "").trim(),
      String(fd.get("requestKey") ?? ""),
    );
  } catch (e) {
    if (e instanceof CartError) return { error: e.message };
    throw e;
  }
  revalidatePath("/tokens");
  revalidatePath("/");
  return { ok: "Tokens sent", at: Date.now() };
}
