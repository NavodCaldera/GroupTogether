"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { FitDataError, parseFitForm, sizeOrder } from "@/lib/fit/data";
import { sizeOf } from "@/lib/variant-options";
import { BUYER_ROLES } from "@/lib/roles";
import { sizesFor } from "@/lib/taxonomy";
import { requireAdmin, requireFactory, requireUser } from "./auth/session";
import { BodyFitError, confirmBody, deleteBody, rebuildBody } from "./body-fit";
import { db } from "./db";
import { DeepFitError, requestDeepFit } from "./deep-fit";
import {
  deleteBodyProfile,
  FitError,
  saveBodyProfile,
  saveFitData,
  saveFitFeedback,
  setFitApproved,
} from "./fit";
import { flash } from "./flash";

export type FitState = { error?: string };

async function attempt(fn: () => Promise<unknown>): Promise<FitState> {
  try {
    await fn();
    return {};
  } catch (e) {
    if (
      e instanceof FitError ||
      e instanceof FitDataError ||
      e instanceof BodyFitError ||
      e instanceof DeepFitError
    )
      return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const strings = (fd: FormData) =>
  Object.fromEntries(
    [...fd.entries()].filter((e): e is [string, string] => typeof e[1] === "string"),
  );

async function chartSizes(productId: string) {
  const p = await db.product.findUnique({
    where: { id: productId },
    select: { kind: true, variants: { select: { options: true } } },
  });
  return p
    ? sizeOrder(
        p.kind,
        [...sizesFor(p.kind ?? undefined), ...p.variants.map((v) => sizeOf(v.options))].filter(
          Boolean,
        ),
      )
    : [];
}

/** A factory's size chart and fabric details; any change waits for an admin's approval. */
export async function saveFactoryFitAction(_p: FitState, fd: FormData): Promise<FitState> {
  const { factoryId } = await requireFactory("products");
  const productId = str(fd, "productId");
  const res = await attempt(async () =>
    saveFitData(productId, parseFitForm(strings(fd), await chartSizes(productId)), {
      sellerId: factoryId,
    }),
  );
  if (res.error) return res;
  revalidatePath(`/seller/products/${productId}`);
  revalidatePath(`/products/${productId}`);
  await flash("Saved. GroupBasket checks the fit data before buyers see it.");
  return {};
}

/** An admin's edit of the fit data, approved as saved. */
export async function saveAdminFitAction(_p: FitState, fd: FormData): Promise<FitState> {
  const admin = await requireAdmin("FACTORY");
  const productId = str(fd, "productId");
  const res = await attempt(async () =>
    saveFitData(productId, parseFitForm(strings(fd), await chartSizes(productId)), {
      adminId: admin.id,
    }),
  );
  if (res.error) return res;
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/products/${productId}`);
  await flash("Fit data saved and approved");
  return {};
}

export async function setFitApprovedAction(_p: FitState, fd: FormData): Promise<FitState> {
  const admin = await requireAdmin("FACTORY");
  const productId = str(fd, "productId");
  const approve = str(fd, "approve") === "1";
  const res = await attempt(() => setFitApproved(admin.id, productId, approve));
  if (res.error) return res;
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/products/${productId}`);
  await flash(approve ? "Fit data approved" : "Fit data approval removed");
  return {};
}

/** The buyer's measurements from the on-phone capture (JSON in `profile`); photos never arrive. */
export async function saveBodyProfileAction(_p: FitState, fd: FormData): Promise<FitState> {
  const user = await requireUser([...BUYER_ROLES]);
  let building = false;
  const res = await attempt(async () => {
    let input: unknown;
    try {
      input = JSON.parse(str(fd, "profile"));
    } catch {
      throw new FitError("Check the form");
    }
    await saveBodyProfile(user.id, input);
    building = !!(input as { outlines?: unknown }).outlines;
  });
  if (res.error) return res;
  revalidatePath("/account/fit");
  await flash("Measurements saved");
  const next = str(fd, "next");
  const product = next.startsWith("/products/") ? next : "";
  // New photos start a 3D body build: stay here to check it.
  redirect(
    building ? `/account/fit${product ? `?next=${product}` : ""}` : product || "/account/fit",
  );
}

/** Rebuilds the 3D body from the kept outlines with the buyer's own chest, waist and hip. */
export async function rebuildBodyAction(_p: FitState, fd: FormData): Promise<FitState> {
  const user = await requireUser([...BUYER_ROLES]);
  const res = await attempt(() =>
    rebuildBody(user.id, {
      chest: str(fd, "chest") || undefined,
      waist: str(fd, "waist") || undefined,
      hip: str(fd, "hip") || undefined,
    }),
  );
  if (res.error) return res;
  revalidatePath("/account/fit");
  return {};
}

export async function confirmBodyAction(_p: FitState, _fd: FormData): Promise<FitState> {
  const user = await requireUser([...BUYER_ROLES]);
  const res = await attempt(() => confirmBody(user.id));
  if (res.error) return res;
  revalidatePath("/account/fit");
  await flash("3D body saved");
  return {};
}

/** Queues a Deep Fit Test of this product on the buyer's own body (5 a day). */
export async function requestDeepFitAction(_p: FitState, fd: FormData): Promise<FitState> {
  const user = await requireUser([...BUYER_ROLES]);
  const productId = str(fd, "productId");
  const res = await attempt(() => requestDeepFit(user.id, productId));
  if (res.error) return res;
  revalidatePath(`/products/${productId}`);
  return {};
}

export async function deleteBodyAction(_p: FitState, _fd: FormData): Promise<FitState> {
  const user = await requireUser([...BUYER_ROLES]);
  await deleteBody(user.id);
  revalidatePath("/account/fit");
  await flash("3D body deleted");
  return {};
}

export async function deleteBodyProfileAction(_p: FitState, _fd: FormData): Promise<FitState> {
  const user = await requireUser([...BUYER_ROLES]);
  await deleteBodyProfile(user.id);
  revalidatePath("/account/fit");
  await flash("Measurements deleted");
  return {};
}

export async function fitFeedbackAction(_p: FitState, fd: FormData): Promise<FitState> {
  const user = await requireUser([...BUYER_ROLES]);
  const regionNotes = Object.fromEntries(
    [...fd.entries()]
      .filter(([k, v]) => k.startsWith("region.") && typeof v === "string" && v)
      .map(([k, v]) => [k.slice(7), v]),
  );
  const res = await attempt(() =>
    saveFitFeedback(user.id, {
      orderLineId: str(fd, "orderLineId"),
      verdict: str(fd, "verdict"),
      regionNotes,
    }),
  );
  if (res.error) return res;
  revalidatePath("/orders/[id]", "page");
  await flash("Thanks");
  return {};
}
