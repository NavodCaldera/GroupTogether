"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser, signInAs } from "./auth/session";
import { APPLICATION_FIELDS, type ApplicationInput } from "@/lib/partner-rules";
import type { FactoryDocKind } from "@/generated/prisma/client";
import {
  PartnerError,
  assertPartnerAdmin,
  submitApplication,
  createInvite,
  reviewApplication,
  recordVisit,
  redeemApprovalLink,
} from "./partners";
import { flash } from "./flash";
export type PartnerState = { error?: string; ok?: boolean; inviteUrl?: string };
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
async function admin() {
  const user = await getCurrentUser();
  if (!user) throw new PartnerError("Sign in as a Factories admin");
  await assertPartnerAdmin(user.id);
  return user;
}
export async function submitApplicationAction(
  _prev: PartnerState,
  fd: FormData,
): Promise<PartnerState> {
  try {
    const input = Object.fromEntries(
      APPLICATION_FIELDS.map(([k]) => [k, str(fd, k)]),
    ) as ApplicationInput;
    const files = (["BR_CERT", "NIC_PHOTO", "FACTORY_PHOTO"] as FactoryDocKind[]).flatMap((kind) =>
      fd
        .getAll(kind)
        .filter((f): f is File => f instanceof File && f.size > 0)
        .map((file) => ({ kind, file })),
    );
    await submitApplication(input, files, str(fd, "inviteToken") || undefined);
  } catch (e) {
    if (e instanceof PartnerError) return { error: e.message };
    throw e;
  }
  await flash("Application submitted");
  return { ok: true };
}
export async function createInviteAction(_prev: PartnerState, fd: FormData): Promise<PartnerState> {
  try {
    const user = await admin();
    const invite = await createInvite(user.id, {
      phone: str(fd, "phone"),
      email: str(fd, "email"),
    });
    return { inviteUrl: `/factories/apply/${invite.token}` };
  } catch (e) {
    if (e instanceof PartnerError) return { error: e.message };
    throw e;
  }
}
export async function reviewApplicationAction(
  _prev: PartnerState,
  fd: FormData,
): Promise<PartnerState> {
  try {
    const user = await admin();
    await reviewApplication(
      user.id,
      str(fd, "id"),
      str(fd, "decision") as "APPROVE" | "REJECT",
      str(fd, "note"),
    );
  } catch (e) {
    if (e instanceof PartnerError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/factory/applications");
  await flash("Application reviewed");
  return {};
}
export async function recordVisitAction(_prev: PartnerState, fd: FormData): Promise<PartnerState> {
  try {
    const user = await admin();
    await recordVisit(user.id, str(fd, "id"), new Date(str(fd, "date")), str(fd, "notes"));
  } catch (e) {
    if (e instanceof PartnerError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/factory/applications");
  await flash("Visit recorded");
  return {};
}
export async function approvalSignInAction(
  _prev: PartnerState,
  fd: FormData,
): Promise<PartnerState> {
  try {
    await signInAs(await redeemApprovalLink(str(fd, "token"), String(fd.get("password") ?? "")));
  } catch (e) {
    if (e instanceof PartnerError) return { error: e.message };
    throw e;
  }
  redirect("/seller/agreement");
}
