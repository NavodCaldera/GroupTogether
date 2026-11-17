"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  MaterialInputError,
  parseMaterialForm,
  parseMeasurementForm,
} from "@/lib/materials/measure";
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
import {
  activateCalibrationSet,
  addCalibrationSwatch,
  addSwatchMeasurement,
  createCalibrationSet,
  deleteSwatchMeasurement,
  publishMaterial,
  reviewProductMaterial,
  setLabScope,
} from "./material-admin";
import { TEST_STANDARDS } from "@/lib/materials/seed";

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
      ? await saveUpload(
          checkUpload(pdf, PDF_TYPES, "lab report", PDF_MAX_BYTES),
          "lab-reports",
          PDF_TYPES,
        )
      : null;
    await addMeasurement(
      productId,
      { ...input, report },
      { sellerId: user.factoryId, userId: user.id },
    );
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

const day = (v: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new MaterialInputError(`Enter the ${label}`);
  return new Date(`${v}T00:00:00Z`);
};

/** A lab's accredited scope, as the admin read it from SLAB on a date */
export async function setLabScopeAction(_p: MaterialState, fd: FormData): Promise<MaterialState> {
  await requireAdmin("FACTORY");
  const res = await attempt(async () => {
    const scope = fd.getAll("scope").map(String);
    if (scope.some((s) => !(TEST_STANDARDS as readonly string[]).includes(s)))
      throw new MaterialInputError("Unknown test");
    const sourceUrl = str(fd, "sourceUrl");
    if (sourceUrl && !/^https:\/\/\S+$/.test(sourceUrl))
      throw new MaterialInputError("The scope link must start with https://");
    await setLabScope(str(fd, "lab"), {
      scope,
      checkedOn: day(str(fd, "checkedOn"), "date you read the scope"),
      accreditationNo: str(fd, "accreditationNo").slice(0, 60),
      sourceUrl,
    });
  });
  if (res.error) return res;
  revalidatePath("/admin/factory/materials/library");
  await flash("Scope saved.");
  return {};
}

const CAL = "/admin/factory/materials/calibration";

export async function createCalibrationSetAction(
  _p: MaterialState,
  fd: FormData,
): Promise<MaterialState> {
  await requireAdmin("FACTORY");
  const res = await attempt(() => createCalibrationSet(str(fd, "code"), str(fd, "name")));
  if (res.error) return res;
  revalidatePath(CAL);
  return {};
}

export async function addCalibrationSwatchAction(
  _p: MaterialState,
  fd: FormData,
): Promise<MaterialState> {
  await requireAdmin("FACTORY");
  const set = str(fd, "set");
  const res = await attempt(() => addCalibrationSwatch(set, str(fd, "material"), str(fd, "label")));
  if (res.error) return res;
  revalidatePath(`${CAL}/${set}`);
  return {};
}

export async function addSwatchMeasurementAction(
  _p: MaterialState,
  fd: FormData,
): Promise<MaterialState> {
  const admin = await requireAdmin("FACTORY");
  const set = str(fd, "set");
  const res = await attempt(async () => {
    const m = parseMeasurementForm(strings(fd));
    await addSwatchMeasurement(
      str(fd, "swatchId"),
      { kind: m.kind, value: m.value, lab: m.lab, testedOn: m.testedOn, reportRef: m.reportRef },
      admin.id,
    );
  });
  if (res.error) return res;
  revalidatePath(`${CAL}/${set}`);
  return {};
}

export async function deleteSwatchMeasurementAction(
  _p: MaterialState,
  fd: FormData,
): Promise<MaterialState> {
  await requireAdmin("FACTORY");
  const res = await attempt(() => deleteSwatchMeasurement(str(fd, "measurementId")));
  if (res.error) return res;
  revalidatePath(`${CAL}/${str(fd, "set")}`);
  return {};
}

export async function activateCalibrationSetAction(
  _p: MaterialState,
  fd: FormData,
): Promise<MaterialState> {
  await requireAdmin("FACTORY");
  const set = str(fd, "set");
  const res = await attempt(() => activateCalibrationSet(set, str(fd, "active") === "1"));
  if (res.error) return res;
  revalidatePath(CAL);
  revalidatePath(`${CAL}/${set}`);
  return {};
}
