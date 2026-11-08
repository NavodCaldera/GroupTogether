"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { applyAsAgent } from "@/server/agents/apply";
import { startDeposit } from "@/server/agents/deposit";
import { requireUser } from "@/server/auth/session";
import { CartError } from "@/server/carts/errors";
import { flash } from "@/server/flash";
import { UploadError } from "@/server/storage";

export type ApplyState = { error?: string };

export async function applyAction(_prev: ApplyState, fd: FormData): Promise<ApplyState> {
  const user = await requireUser([], "/agents/apply");
  try {
    await applyAsAgent(user.id, fd);
  } catch (error) {
    if (error instanceof CartError || error instanceof UploadError) return { error: error.message };
    throw error;
  }
  await flash("Application sent");
  revalidatePath("/agents/apply");
  redirect("/agents/apply");
}

export async function payDepositAction(_prev: ApplyState, _fd: FormData): Promise<ApplyState> {
  const user = await requireUser([], "/agents/apply");
  let url: string;
  try {
    url = (await startDeposit(user.id)).redirectUrl;
  } catch (error) {
    if (error instanceof CartError) return { error: error.message };
    throw error;
  }
  redirect(url);
}
