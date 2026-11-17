"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { MaterialInputError, parseMaterialForm, parseMeasurementForm } from "@/lib/materials/measure";
import { requireAdmin, requireFactory } from "./auth/session";
import { flash } from "./flash";
import {
  addMeasurement,
  deleteMeasurement,
  MaterialError,
  setMaterialVideo,
  setProductMaterial,
} from "./materials";
import {
  checkUpload,
  PDF_MAX_BYTES,
  PDF_TYPES,
  saveUpload,
  UploadError,
  VIDEO_MAX_BYTES,
  VIDEO_TYPES,
} from "./storage";
import { publishMaterial, reviewProductMaterial } from "./material-admin";

export type MaterialState = { error?: string };

async function attempt(fn: () => Promise<unknown>): Promise<MaterialState> {
  try {
    await fn();
    return {};
  } catch (e) {
    if (e instanceof MaterialError || e instanceof MaterialInputError || e instanceof UploadError)
      return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
}

const strings = (fd: FormData) =>
  Object.fromEntries(
    [...fd.entries()].filter((e): e is [string, string] => typeof e[1] === "string"),
  );
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const file = (fd: FormData, k: string) => {
  const f = fd.get(k);
  return f instanceof File && f.size > 0 ? f : null;
};

function refresh(productId: string) {
  revalidatePath(`/seller/products/${productId}`);
  revalidatePath(`/products/${productId}`);
}

export async function saveProductMaterialAction(
  _p: MaterialState,
  fd: FormData,
): Promise<MaterialState> {
  const { factoryId } = await requireFactory("products");
  const productId = str(fd, "productId");
  let review: string[] = [];
  const res = await attempt(async () => {
    ({ review } = await setProductMaterial(productId, parseMaterialForm(strings(fd)), {
      sellerId: factoryId,
    }));
  });
  if (res.error) return res;
  refresh(productId);
  await flash(review.length ? "Saved. GroupBasket will check the figures." : "Saved.");
  return {};
}

export async function addMeasurementAction(
  _p: MaterialState,
  fd: FormData,
): Promise<MaterialState> {
  const user = await requireFactory("products");
  const productId = str(fd, "productId");
  const res = await attempt(async () => {
    const input = parseMeasurementForm(strings(fd));
    const pdf = file(fd, "report");
    const report = pdf
      ? await saveUpload(checkUpload(pdf, PDF_TYPES, "lab report", PDF_MAX_BYTES), "lab-reports", PDF_TYPES)
      : null;
    await addMeasurement(productId, { ...input, report }, { sellerId: user.factoryId, userId: user.id });
  });
  if (res.error) return res;
  refresh(productId);
  await flash("Result added.");
  return {};
}

export async function deleteMeasurementAction(
  _p: MaterialState,
  fd: FormData,
): Promise<MaterialState> {
  const { factoryId } = await requireFactory("products");
  const productId = str(fd, "productId");
  const res = await attempt(() =>
    deleteMeasurement(productId, str(fd, "measurementId"), { sellerId: factoryId }),
  );
  if (res.error) return res;
  refresh(productId);
  return {};
}

export async function saveMaterialVideoAction(
  _p: MaterialState,
  fd: FormData,
): Promise<MaterialState> {
  const { factoryId } = await requireFactory("products");
  const productId = str(fd, "productId");
  const res = await attempt(async () => {
    const remove = str(fd, "remove") === "1";
    const video = remove
      ? null
      : await saveUpload(
          checkUpload(file(fd, "video"), VIDEO_TYPES, "video", VIDEO_MAX_BYTES),
          "material-videos",
          VIDEO_TYPES,
        );
    await setMaterialVideo(productId, video, { sellerId: factoryId });
  });
  if (res.error) return res;
  refresh(productId);
  await flash("Saved.");
  return {};
}

// ─── Factory admin ────────────────────────────────────────────────────────

export async function publishMaterialAction(
  _p: MaterialState,
  fd: FormData,
): Promise<MaterialState> {
  const admin = await requireAdmin("FACTORY");
  const code = str(fd, "code");
  const res = await attempt(() => publishMaterial(admin.id, code, str(fd, "publish") === "1"));
  if (res.error) return res;
  revalidatePath("/admin/factory/materials");
  revalidatePath(`/admin/factory/materials/${code}`);
  return {};
}

export async function reviewProductMaterialAction(
  _p: MaterialState,
  fd: FormData,
): Promise<MaterialState> {
  const admin = await requireAdmin("FACTORY");
  const res = await attempt(() => reviewProductMaterial(admin.id, str(fd, "productMaterialId")));
  if (res.error) return res;
  revalidatePath("/admin/factory/materials/reports");
  return {};
}
