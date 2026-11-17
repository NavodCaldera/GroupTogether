/**
 * Factory admin side of the material library (DEC-022): publishing materials, clearing products
 * whose figures are far from the library, and the reports. Library content itself (sources,
 * evidence, materials, rules) is edited in `seeds/` and loaded with `npm run materials:load`, so
 * every change is reviewed in git; these pages read it.
 */
import "server-only";
import type { TestStandard } from "@/generated/prisma/client";
import { isAccredited, MEASURE_KINDS, type MeasureKind } from "@/lib/materials/measure";
import { BREATH_MEAS, SOFT_MEAS, SURFACE_MEAS } from "@/lib/materials/rules";
import { db } from "./db";
import { MaterialError, recomputeAll } from "./materials";

/** The tests a reference swatch is measured with: the ones the measured bars rank against */
export const MEASURED_KINDS = MEASURE_KINDS.filter((k) =>
  [...SOFT_MEAS.accepts, ...SURFACE_MEAS.accepts, ...BREATH_MEAS.accepts].some(
    (a) => a.testStandard === k.testStandard && a.property === k.property,
  ),
);
export const MIN_SWATCHES = SOFT_MEAS.minSwatches;

export async function publishMaterial(adminId: string, code: string, publish: boolean) {
  const m = await db.material.findUnique({
    where: { code },
    select: { id: true, _count: { select: { products: true } } },
  });
  if (!m) throw new MaterialError("Material not found");
  if (!publish && m._count.products)
    throw new MaterialError("Products use this material; it stays published");
  await db.material.update({
    where: { id: m.id },
    data: publish
      ? { status: "PUBLISHED", publishedAt: new Date(), publishedById: adminId }
      : { status: "DRAFT", publishedAt: null, publishedById: null },
  });
}

export async function reviewProductMaterial(adminId: string, productMaterialId: string) {
  const { count } = await db.productMaterial.updateMany({
    where: { id: productMaterialId, needsReviewAt: { not: null } },
    data: { needsReviewAt: null, reviewedAt: new Date(), reviewedById: adminId },
  });
  if (!count) throw new MaterialError("Nothing to review");
}

/** The admin reports: what waits for a person, and where the library is thin */
export async function materialReports() {
  const [review, estimates, missing, evidence, sources] = await Promise.all([
    db.productMaterial.findMany({
      where: { needsReviewAt: { not: null } },
      orderBy: { needsReviewAt: "asc" },
      select: {
        id: true,
        actualGsm: true,
        actualComposition: true,
        needsReviewAt: true,
        product: { select: { id: true, title: true, seller: { select: { name: true } } } },
        material: {
          select: { code: true, displayName: true, defaultGsmMin: true, defaultGsmMax: true },
        },
      },
    }),
    db.productMaterial.findMany({
      where: { verificationLevel: "LIBRARY_ESTIMATE" },
      select: {
        id: true,
        product: { select: { id: true, title: true } },
        material: { select: { displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.feelAxis.groupBy({ by: ["axis"], where: { basis: "NOT_AVAILABLE" }, _count: true }),
    db.evidence.findMany({
      select: {
        code: true,
        subjectType: true,
        subjectCode: true,
        excerpt: true,
        source: { select: { tier: true } },
      },
    }),
    db.source.count(),
  ]);
  const bySubject = new Map<string, string[]>();
  for (const e of evidence.filter((x) => x.excerpt != null)) {
    const k = `${e.subjectType}:${e.subjectCode}`;
    bySubject.set(k, [...(bySubject.get(k) ?? []), e.source.tier]);
  }
  return {
    review,
    estimates,
    missing,
    unverified: evidence.filter((e) => e.excerpt == null).map((e) => e.code),
    tierCOnly: [...bySubject].filter(([, ts]) => ts.every((t) => t === "C")).map(([k]) => k),
    sources,
  };
}

export function listSources() {
  return db.source.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { evidence: true } } },
  });
}

export function listEvidence(subject?: { type: string; code: string }) {
  return db.evidence.findMany({
    where: subject ? { subjectType: subject.type as never, subjectCode: subject.code } : undefined,
    orderBy: { code: "asc" },
    include: { source: { select: { code: true, title: true, url: true, tier: true } } },
  });
}

export function listRules() {
  return db.methodologyRule.findMany({ orderBy: [{ code: "asc" }, { version: "desc" }] });
}

export function listLabs() {
  return db.lab.findMany({
    orderBy: { name: "asc" },
    include: { scopeSource: { select: { url: true } }, _count: { select: { measurements: true } } },
  });
}

export function listCalibrationSets() {
  return db.calibrationSet.findMany({
    orderBy: { code: "asc" },
    include: {
      swatches: {
        include: {
          material: { select: { code: true } },
          _count: { select: { measurements: true } },
        },
      },
    },
  });
}

// ─── Lab scopes (checked by a Factory admin's team) ──────────────────────

/**
 * Records a lab's accredited scope as read from its current SLAB scope document on a date. The
 * loader keeps this over an older seed check. Existing results from the lab are re-checked and
 * every feel profile recomputed.
 */
export async function setLabScope(
  labCode: string,
  input: { scope: string[]; checkedOn: Date; accreditationNo: string; sourceUrl: string },
) {
  const lab = await db.lab.findUnique({ where: { code: labCode }, select: { id: true } });
  if (!lab) throw new MaterialError("Lab not found");
  if (input.checkedOn.getTime() > Date.now())
    throw new MaterialError("The check date is in the future");
  if (input.scope.length && !input.sourceUrl)
    throw new MaterialError("Give the link to the scope document you read");
  const scope = input.scope as TestStandard[];
  await db.$transaction(async (tx) => {
    let scopeSourceId: string | undefined;
    if (input.sourceUrl) {
      const code = `LAB-${labCode}-${input.checkedOn.toISOString().slice(0, 10)}`;
      const src = await tx.source.upsert({
        where: { code },
        create: {
          code,
          title: `Accredited scope: ${labCode}`,
          publisher: "Sri Lanka Accreditation Board",
          url: input.sourceUrl,
          accessedOn: input.checkedOn,
          tier: "B",
          notes: "Recorded by a Factory admin in the app.",
        },
        update: { url: input.sourceUrl, accessedOn: input.checkedOn },
        select: { id: true },
      });
      scopeSourceId = src.id;
    }
    await tx.lab.update({
      where: { id: lab.id },
      data: {
        scope,
        scopeVerifiedOn: input.checkedOn,
        accreditationNo: input.accreditationNo || null,
        ...(scopeSourceId ? { scopeSourceId } : {}),
      },
    });
    const ms = await tx.measurement.findMany({
      where: { labId: lab.id },
      select: { id: true, testStandard: true },
    });
    for (const m of ms)
      await tx.measurement.update({
        where: { id: m.id },
        data: { accredited: scope.includes(m.testStandard) },
      });
  });
  await recomputeAll();
}

// ─── Reference swatch set (turns on the measured bars) ───────────────────

export async function createCalibrationSet(code: string, name: string) {
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(code))
    throw new MaterialError("Code: 2 to 40 letters, digits, - or _");
  if (!name.trim()) throw new MaterialError("Enter a name");
  if (await db.calibrationSet.count({ where: { code } }))
    throw new MaterialError("That code is taken");
  await db.calibrationSet.create({ data: { code, name: name.trim() } });
}

export async function addCalibrationSwatch(setCode: string, materialCode: string, label: string) {
  const [set, material] = await Promise.all([
    db.calibrationSet.findUnique({ where: { code: setCode }, select: { id: true } }),
    db.material.findUnique({ where: { code: materialCode }, select: { id: true } }),
  ]);
  if (!set) throw new MaterialError("Set not found");
  if (!material) throw new MaterialError("Choose the material");
  const name = label.trim();
  if (!name || name.length > 60) throw new MaterialError("Enter a swatch label");
  if (await db.calibrationSwatch.count({ where: { setId: set.id, label: name } }))
    throw new MaterialError("That label is already in the set");
  await db.calibrationSwatch.create({
    data: { setId: set.id, materialId: material.id, label: name },
  });
}

/** One lab result on a reference swatch; it counts only if the lab's checked scope lists the test */
export async function addSwatchMeasurement(
  swatchId: string,
  input: { kind: MeasureKind; value: number; lab: string; testedOn: Date; reportRef: string },
  adminId: string,
) {
  const swatch = await db.calibrationSwatch.findUnique({
    where: { id: swatchId },
    select: { id: true },
  });
  if (!swatch) throw new MaterialError("Swatch not found");
  const lab = await db.lab.findUnique({
    where: { code: input.lab },
    select: { id: true, name: true, accreditationNo: true, scope: true, scopeVerifiedOn: true },
  });
  if (!lab) throw new MaterialError("Reference swatches need a lab from the list");
  const m = await db.measurement.create({
    data: {
      calibrationSwatchId: swatch.id,
      testStandard: input.kind.testStandard as TestStandard,
      property: input.kind.property,
      unit: input.kind.unit,
      value: input.value,
      labId: lab.id,
      labName: lab.name,
      labAccreditationNo: lab.accreditationNo,
      accredited: isAccredited(lab, input.kind.testStandard),
      reportRef: input.reportRef || null,
      testedOn: input.testedOn,
      enteredById: adminId,
    },
    select: { accredited: true },
  });
  await recomputeAll();
  return m;
}

export async function deleteSwatchMeasurement(measurementId: string) {
  const { count } = await db.measurement.deleteMany({
    where: { id: measurementId, calibrationSwatchId: { not: null } },
  });
  if (!count) throw new MaterialError("Result not found");
  await recomputeAll();
}

/** Only one set is active; activating one switches the others off */
export async function activateCalibrationSet(code: string, active: boolean) {
  const set = await db.calibrationSet.findUnique({ where: { code }, select: { id: true } });
  if (!set) throw new MaterialError("Set not found");
  await db.$transaction([
    ...(active
      ? [db.calibrationSet.updateMany({ where: { id: { not: set.id } }, data: { activeAt: null } })]
      : []),
    db.calibrationSet.update({
      where: { id: set.id },
      data: { activeAt: active ? new Date() : null },
    }),
  ]);
  await recomputeAll();
}

export function getCalibrationSet(code: string) {
  return db.calibrationSet.findUnique({
    where: { code },
    include: {
      swatches: {
        orderBy: { label: "asc" },
        include: {
          material: { select: { code: true, displayName: true } },
          measurements: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
}

/** Swatches with an accredited result per measured test, against the minimum the rules need */
export function swatchCoverage(
  swatches: {
    measurements: { testStandard: string; property: string; unit: string; accredited: boolean }[];
  }[],
) {
  return MEASURED_KINDS.map((k) => ({
    ...k,
    count: swatches.filter((s) =>
      s.measurements.some(
        (m) =>
          m.accredited &&
          m.testStandard === k.testStandard &&
          m.property === k.property &&
          m.unit === k.unit,
      ),
    ).length,
  }));
}
