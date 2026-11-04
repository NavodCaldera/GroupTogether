"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSeller } from "./auth/session";
import { acceptDisplayedVersion, publishVersion } from "./agreements";
import { PartnerError } from "./partners";
import { flash } from "./flash";
import type { PartnerState } from "./partner-actions";
export async function publishAgreementAction(
  _prev: PartnerState,
  fd: FormData,
): Promise<PartnerState> {
  const admin = await requireAdmin("CORE");
  try {
    await publishVersion(admin.id, String(fd.get("text") ?? ""));
  } catch (e) {
    if (e instanceof PartnerError) return { error: e.message };
    throw e;
  }
  revalidatePath("/admin/settings");
  revalidatePath("/seller", "layout");
  revalidatePath("/shop");
  await flash("Agreement published");
  return {};
}
export async function acceptAgreementAction(
  _prev: PartnerState,
  fd: FormData,
): Promise<PartnerState> {
  const owner = await requireSeller();
  if (fd.get("agree") !== "on") return { error: "Confirm the agreement" };
  try {
    const versionId = String(fd.get("versionId") ?? "");
    if (!versionId) return { error: "Reload the agreement" };
    await acceptDisplayedVersion(owner.id, versionId);
  } catch (e) {
    if (e instanceof PartnerError) return { error: e.message };
    throw e;
  }
  revalidatePath("/seller", "layout");
  revalidatePath("/shop");
  await flash("Agreement accepted");
  redirect("/seller");
}
