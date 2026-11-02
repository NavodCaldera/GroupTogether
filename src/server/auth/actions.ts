"use server";

import { redirect } from "next/navigation";
import {
  AuthError,
  authenticate,
  homeFor,
  profileSchema,
  registerUser,
  signUpSchema,
  updateProfile,
} from "./service";
import { flash } from "../flash";
import { requireUser, signInAs, signOut } from "./session";

export type FormState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

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
  await flash("Account created. Welcome to GroupBasket!");
  redirect(safeNext(formData.get("next")) ?? "/");
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let home = "/";
  try {
    const user = await authenticate(
      String(formData.get("email") ?? ""),
      String(formData.get("password") ?? ""),
    );
    await signInAs(user.id);
    home = homeFor(user.role, user.adminArea);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  await flash("Signed in");
  redirect(safeNext(formData.get("next")) ?? home);
}

/** Saves the profile; with `next` (sent here to finish something) it goes back there. */
export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser([], "/account");
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await updateProfile(user.id, parsed.data);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  await flash("Saved");
  const next = safeNext(formData.get("next"));
  if (next) redirect(next);
  return {};
}

/** A same-site path to return to after sign-in, never another site. */
function safeNext(v: FormDataEntryValue | null) {
  if (typeof v !== "string" || !v.startsWith("/")) return null;
  return v.startsWith("//") || v.startsWith("/\\") ? null : v;
}

export async function signOutAction() {
  await signOut();
  await flash("Signed out");
  redirect("/");
}
