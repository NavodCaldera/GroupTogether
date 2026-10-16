"use server";

import { redirect } from "next/navigation";
import { AuthError, authenticate, homeFor, registerUser, signUpSchema } from "./service";
import { signInAs, signOut } from "./session";

export type FormState = { error?: string; fieldErrors?: Record<string, string[] | undefined> };

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const user = await registerUser(parsed.data);
    await signInAs(user.id);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect(safeNext(formData.get("next")) ?? "/");
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let role;
  try {
    const user = await authenticate(
      String(formData.get("email") ?? ""),
      String(formData.get("password") ?? ""),
    );
    await signInAs(user.id);
    role = user.role;
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect(safeNext(formData.get("next")) ?? homeFor(role));
}

/** A same-site path to return to after sign-in, never another site. */
function safeNext(v: FormDataEntryValue | null) {
  if (typeof v !== "string" || !v.startsWith("/")) return null;
  return v.startsWith("//") || v.startsWith("/\\") ? null : v;
}

export async function signOutAction() {
  await signOut();
  redirect("/");
}
