/**
 * Material library and product materials (DEC-022). A factory picks a published library material
 * for a product, declares its gsm and composition, and may add lab results and a video. Every
 * change recomputes the product's stored feel profile in the same transaction.
 */
import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { buildCard, type FactsForCard, type MaterialCard } from "@/lib/materials/card";
import { isAccredited, reviewReasons, type MeasureKind } from "@/lib/materials/measure";
import { computeProfile } from "@/lib/materials/profile";
import { BREATH_MEAS, SOFT_MEAS, SURFACE_MEAS, ruleEvidenceCodes } from "@/lib/materials/rules";
import type {
  AxisResult,
  CalibrationValues,
  EvidenceLite,
  FabricFacts,
  FiberShare,
} from "@/lib/materials/types";
import { productHasFeature } from "./categories";
import { db } from "./db";
import { fitDataHash, FIT_DATA_SELECT } from "./deep-fit-jobs";
import { AppError } from "./errors";
import { storage } from "./storage";

export class MaterialError extends AppError {}

type Tx = Prisma.TransactionClient;
type By = { sellerId: string } | { adminId: string };

const productWhere = (productId: string, by: By): Prisma.ProductWhereInput =>
  "sellerId" in by
    ? { id: productId, sellerId: by.sellerId, seller: { isBrand: false } }
    : { id: productId, OR: [{ sellerId: null }, { seller: { isBrand: false } }] };

// ─── Library reads ────────────────────────────────────────────────────────

const MATERIAL_INCLUDE = {
  construction: { select: { code: true, name: true, category: true } },
  yarnProcess: { select: { code: true, name: true } },
  finish: { select: { code: true, name: true } },
  fibers: {
    select: {
      percentage: true,
      fiber: { select: { code: true, name: true } },
      fiberStandard: { select: { code: true, name: true } },
    },
    orderBy: { percentage: "desc" },
  },
} satisfies Prisma.MaterialInclude;

export type LibraryMaterial = Prisma.MaterialGetPayload<{ include: typeof MATERIAL_INCLUDE }>;

export function libraryComposition(m: Pick<LibraryMaterial, "fibers">): FiberShare[] {
  return m.fibers.map((f) => ({
    fiber: f.fiber.code,
    standard: f.fiberStandard?.code ?? null,
    pct: f.percentage,
  }));
}

/** Library materials, newest names first by display name; factories see only published ones */
export async function listMaterials(filters: {
  q?: string;
  category?: string;
  status?: "DRAFT" | "PUBLISHED";
}) {
  const q = filters.q?.trim();
  return db.material.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.category
        ? {
            construction: {
              category: filters.category as LibraryMaterial["construction"]["category"],
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { construction: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: MATERIAL_INCLUDE,
    orderBy: { displayName: "asc" },
  });
}

export function getMaterial(code: string) {
  return db.material.findUnique({ where: { code }, include: MATERIAL_INCLUDE });
}

/** Fibres, standards and labs for the factory form */
export async function materialFormOptions() {
  const [fibers, standards, labs] = await Promise.all([
    db.fiber.findMany({ select: { code: true, name: true }, orderBy: { name: "asc" } }),
    db.fiberStandard.findMany({ select: { code: true, name: true }, orderBy: { name: "asc" } }),
    db.lab.findMany({ select: { code: true, name: true, city: true }, orderBy: { name: "asc" } }),
  ]);
  return { fibers, standards, labs };
}

// ─── Feel facts and profile ───────────────────────────────────────────────

const PM_INCLUDE = {
  material: { include: MATERIAL_INCLUDE },
  measurements: { orderBy: { createdAt: "desc" } },
  feel: { include: { axes: true } },
  product: { select: { careNotes: true } },
} satisfies Prisma.ProductMaterialInclude;

type PmRow = Prisma.ProductMaterialGetPayload<{ include: typeof PM_INCLUDE }>;

export function readComposition(json: unknown): FiberShare[] | null {
  if (!Array.isArray(json)) return null;
  const out = json.filter(
    (f): f is FiberShare =>
      !!f && typeof f === "object" && typeof f.fiber === "string" && typeof f.pct === "number",
  );
  return out.length
    ? out.map((f) => ({ fiber: f.fiber, standard: f.standard ?? null, pct: f.pct }))
    : null;
}

async function evidenceFor(tx: Tx, pm: PmRow, composition: FiberShare[]): Promise<EvidenceLite[]> {
  const m = pm.material;
  const subjects: { subjectType: EvidenceLite["subjectType"]; subjectCode: string }[] = [
    { subjectType: "MATERIAL", subjectCode: m.code },
    { subjectType: "CONSTRUCTION", subjectCode: m.construction.code },
    { subjectType: "FINISH", subjectCode: m.finish.code },
    ...(m.yarnProcess
      ? [{ subjectType: "YARN_PROCESS" as const, subjectCode: m.yarnProcess.code }]
      : []),
    ...composition.map((f) => ({ subjectType: "FIBER" as const, subjectCode: f.fiber })),
  ];
  const rows = await tx.evidence.findMany({
    where: { OR: [...subjects, { code: { in: ruleEvidenceCodes() } }] },
    select: {
      code: true,
      subjectType: true,
      subjectCode: true,
      attribute: true,
      valueText: true,
      valueMin: true,
      valueMax: true,
      excerpt: true,
    },
    orderBy: { code: "asc" },
  });
  return rows.map(({ excerpt, ...e }) => ({ ...e, verified: excerpt != null }));
}

function factsOf(pm: PmRow, evidence: EvidenceLite[], composition: FiberShare[]): FabricFacts {
  const m = pm.material;
  return {
    materialCode: m.code,
    constructionCode: m.construction.code,
    constructionCategory: m.construction.category,
    yarnProcessCode: m.yarnProcess?.code ?? null,
    finishCode: m.finish.code,
    fibers: composition,
    gsm: pm.actualGsm,
    gsmRange:
      m.defaultGsmMin != null && m.defaultGsmMax != null
        ? [m.defaultGsmMin, m.defaultGsmMax]
        : null,
    evidence,
    measurements: pm.measurements.map((x) => ({
      id: x.id,
      testStandard: x.testStandard,
      property: x.property,
      value: x.value,
      unit: x.unit,
      accredited: x.accredited,
    })),
  };
}

/** Accredited reference values from active calibration sets, per measured property */
export async function calibrationValues(tx: Tx = db): Promise<CalibrationValues[]> {
  const kinds = [...SOFT_MEAS.accepts, ...SURFACE_MEAS.accepts, ...BREATH_MEAS.accepts];
  const sets = await tx.calibrationSet.findMany({
    where: { activeAt: { not: null } },
    orderBy: { activeAt: "desc" },
    select: {
      code: true,
      swatches: {
        select: {
          measurements: {
            where: { accredited: true },
            select: { testStandard: true, property: true, unit: true, value: true },
          },
        },
      },
    },
  });
  const out: CalibrationValues[] = [];
  for (const k of kinds) {
    for (const s of sets) {
      const values = s.swatches.flatMap((w) =>
        w.measurements
          .filter(
            (x) =>
              x.testStandard === k.testStandard && x.property === k.property && x.unit === k.unit,
          )
          .map((x) => x.value),
      );
      if (values.length && !out.some((o) => o.property === k.property && o.unit === k.unit)) {
        out.push({ setCode: s.code, property: k.property, unit: k.unit, values });
        break;
      }
    }
  }
  return out;
}

function levelOf(axes: AxisResult[], measurements: number, declaredComposition: boolean) {
  const shown = axes.filter((a) => a.basis !== "NOT_AVAILABLE");
  if (shown.length && shown.every((a) => a.basis === "MEASURED")) return "LAB_MEASURED" as const;
  if (measurements || declaredComposition) return "FACTORY_DECLARED" as const;
  return "LIBRARY_ESTIMATE" as const;
}

/** Recomputes and stores one product material's feel profile and verification level */
export async function recomputeFeelProfile(tx: Tx, productMaterialId: string) {
  const pm = await tx.productMaterial.findUniqueOrThrow({
    where: { id: productMaterialId },
    include: PM_INCLUDE,
  });
  const composition = readComposition(pm.actualComposition) ?? libraryComposition(pm.material);
  const facts = factsOf(pm, await evidenceFor(tx, pm, composition), composition);
  const axes = computeProfile(facts, await calibrationValues(tx));
  await tx.feelProfile.deleteMany({ where: { productMaterialId } });
  await tx.feelProfile.create({
    data: {
      productMaterialId,
      axes: {
        create: axes.map((a) => ({
          axis: a.axis,
          basis: a.basis,
          value: a.value,
          bandMin: a.band?.[0] ?? null,
          bandMax: a.band?.[1] ?? null,
          ruleCode: a.rule?.code ?? null,
          ruleVersion: a.rule?.version ?? null,
          evidenceCodes: a.evidenceCodes,
          measurementIds: a.measurementIds,
        })),
      },
    },
  });
  await tx.productMaterial.update({
    where: { id: productMaterialId },
    data: {
      verificationLevel: levelOf(axes, pm.measurements.length, pm.actualComposition != null),
    },
  });
  return axes;
}

/** Every product material, after a library or calibration change */
export async function recomputeAll() {
  const ids = await db.productMaterial.findMany({ select: { id: true } });
  for (const { id } of ids) await db.$transaction((tx) => recomputeFeelProfile(tx, id));
  return ids.length;
}

const AXIS_ORDER = ["SOFT_FIRM", "LIGHT_SUBSTANTIAL", "SMOOTH_TEXTURED", "BREATHABLE_INSULATING"];

function storedAxes(pm: PmRow): AxisResult[] | null {
  if (!pm.feel) return null;
  return [...pm.feel.axes]
    .sort((a, b) => AXIS_ORDER.indexOf(a.axis) - AXIS_ORDER.indexOf(b.axis))
    .map((a) => ({
      axis: a.axis,
      basis: a.basis,
      value: a.value,
      band: a.bandMin != null && a.bandMax != null ? [a.bandMin, a.bandMax] : null,
      rule:
        a.ruleCode && a.ruleVersion != null ? { code: a.ruleCode, version: a.ruleVersion } : null,
      evidenceCodes: a.evidenceCodes,
      measurementIds: a.measurementIds,
    }));
}

async function cardFacts(pm: PmRow): Promise<FactsForCard> {
  const composition = readComposition(pm.actualComposition) ?? libraryComposition(pm.material);
  const evidence = await evidenceFor(db, pm, composition);
  const facts = factsOf(pm, evidence, composition);
  const [fibers, standards] = await Promise.all([
    db.fiber.findMany({
      where: { code: { in: composition.map((f) => f.fiber) } },
      select: { code: true, name: true },
    }),
    db.fiberStandard.findMany({
      where: { code: { in: composition.flatMap((f) => (f.standard ? [f.standard] : [])) } },
      select: { code: true, name: true },
    }),
  ]);
  return {
    ...facts,
    productMaterialId: pm.id,
    displayName: pm.material.displayName,
    constructionName: pm.material.construction.name,
    yarnProcessName: pm.material.yarnProcess?.name ?? null,
    feelsLikeAnchor: pm.material.feelsLikeAnchor,
    composition,
    fiberNames: Object.fromEntries(fibers.map((f) => [f.code, f.name])),
    standardNames: Object.fromEntries(standards.map((f) => [f.code, f.name])),
    actualGsm: pm.actualGsm,
    careNotes: pm.product.careNotes,
    videoUrl: pm.videoKey ? `/api/material-videos/${pm.id}` : null,
    axes: storedAxes(pm) ?? computeProfile(facts, await calibrationValues()),
  };
}

/** The buyer Material Card for a product's shell fabric, or null when none is set */
export async function getMaterialCard(productId: string): Promise<MaterialCard | null> {
  // The Material Card is a clothing add-on (DEC-029).
  if (!(await productHasFeature(productId, "materials"))) return null;
  const pm = await db.productMaterial.findUnique({
    where: { productId_role: { productId, role: "SHELL" } },
    include: PM_INCLUDE,
  });
  if (!pm) return null;
  return buildCard(await cardFacts(pm), { declaredComposition: pm.actualComposition != null });
}

/** Everything a card's values rest on, for "How we know this" and the admin's "Why this value?" */
export async function getProvenance(card: MaterialCard) {
  const codes = new Set<string>();
  const ids = new Set<string>();
  const rules = new Map<string, { code: string; version: number }>();
  const note = (
    p:
      | {
          kind: string;
          evidenceCodes?: string[];
          measurementIds?: string[];
          rule?: { code: string; version: number };
        }
      | null
      | undefined,
  ) => {
    if (!p) return;
    p.evidenceCodes?.forEach((c) => codes.add(c));
    p.measurementIds?.forEach((c) => ids.add(c));
    if (p.rule) rules.set(`${p.rule.code}@${p.rule.version}`, p.rule);
  };
  for (const v of [
    card.feelsLike,
    card.adjectives,
    card.onSkin,
    card.madeFor,
    card.care,
    ...Object.values(card.details),
  ])
    note(v?.provenance);
  for (const a of card.axes) {
    a.evidenceCodes.forEach((c) => codes.add(c));
    a.measurementIds.forEach((c) => ids.add(c));
    if (a.rule) rules.set(`${a.rule.code}@${a.rule.version}`, a.rule);
  }
  const [evidence, measurements, ruleRows] = await Promise.all([
    db.evidence.findMany({
      where: { code: { in: [...codes] } },
      select: {
        code: true,
        claim: true,
        locator: true,
        excerpt: true,
        source: {
          select: {
            code: true,
            title: true,
            publisher: true,
            url: true,
            tier: true,
            accessedOn: true,
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    db.measurement.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        testStandard: true,
        property: true,
        value: true,
        unit: true,
        labName: true,
        accredited: true,
        testedOn: true,
        reportKey: true,
      },
    }),
    db.methodologyRule.findMany({
      where: { OR: [...rules.values()].map((r) => ({ code: r.code, version: r.version })) },
      select: { code: true, version: true, ruleDescription: true, formula: true },
    }),
  ]);
  return { evidence, measurements, rules: rules.size ? ruleRows : [] };
}

// ─── Factory changes ──────────────────────────────────────────────────────

/** The product's shell material for the factory or admin form */
export function getProductMaterial(productId: string) {
  return db.productMaterial.findUnique({
    where: { productId_role: { productId, role: "SHELL" } },
    include: {
      material: { include: MATERIAL_INCLUDE },
      measurements: { orderBy: { createdAt: "desc" } },
      feel: { include: { axes: true } },
    },
  });
}

export async function setProductMaterial(
  productId: string,
  input: { materialCode: string; gsm: number; composition: FiberShare[]; confirmRange: boolean },
  by: By,
) {
  if (!(await db.product.count({ where: productWhere(productId, by) })))
    throw new MaterialError("Product not found");
  if (!(await productHasFeature(productId, "materials")))
    throw new MaterialError("Materials are only for clothing");
  const material = await getMaterial(input.materialCode);
  if (!material || ("sellerId" in by && material.status !== "PUBLISHED"))
    throw new MaterialError("Choose a material from the library");
  const sum = input.composition.reduce((s, f) => s + f.pct, 0);
  if (sum !== 100) throw new MaterialError(`The composition adds up to ${sum}%, not 100%`);
  const known = await db.fiber.count({
    where: { code: { in: input.composition.map((f) => f.fiber) } },
  });
  if (known !== new Set(input.composition.map((f) => f.fiber)).size)
    throw new MaterialError("Choose each fibre from the list");

  const library = libraryComposition(material);
  const range: [number, number] | null =
    material.defaultGsmMin != null && material.defaultGsmMax != null
      ? [material.defaultGsmMin, material.defaultGsmMax]
      : null;
  const reasons = reviewReasons(input.gsm, range, input.composition, library);
  if (reasons.length && !input.confirmRange)
    throw new MaterialError(`${reasons.join("; ")}. Tick the box to confirm.`);
  const same = (a: FiberShare[], b: FiberShare[]) =>
    JSON.stringify([...a].sort((x, y) => x.fiber.localeCompare(y.fiber))) ===
    JSON.stringify([...b].sort((x, y) => x.fiber.localeCompare(y.fiber)));
  const composition = same(input.composition, library) ? null : input.composition;
  const setById = "sellerId" in by ? by.sellerId : by.adminId;

  return db.$transaction(async (tx) => {
    const data = {
      materialId: material.id,
      actualGsm: input.gsm,
      actualComposition: composition ?? Prisma.DbNull,
      needsReviewAt: reasons.length ? new Date() : null,
      reviewedAt: null,
      reviewedById: null,
      setById,
    };
    const pm = await tx.productMaterial.upsert({
      where: { productId_role: { productId, role: "SHELL" } },
      create: { productId, role: "SHELL", ...data },
      update: data,
      select: { id: true },
    });
    // One home for gsm: mirrored to the product for the fit heatmap and cloth simulation. The
    // weave text is left alone, so picking a material clears fit approval only if gsm changes.
    const before = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: FIT_DATA_SELECT,
    });
    const after = await tx.product.update({
      where: { id: productId },
      data: { gsm: input.gsm },
      select: FIT_DATA_SELECT,
    });
    if (fitDataHash(before) !== fitDataHash(after)) {
      await tx.clusterDrape.deleteMany({ where: { productId } });
      await tx.garmentRegionTension.deleteMany({ where: { productId, note: "simulated" } });
      if ("sellerId" in by)
        await tx.product.update({
          where: { id: productId },
          data: { fitApprovedAt: null, fitApprovedById: null },
        });
    }
    await recomputeFeelProfile(tx, pm.id);
    return { id: pm.id, review: reasons };
  });
}

async function ownPm(productId: string, by: By) {
  const pm = await db.productMaterial.findFirst({
    where: { productId, role: "SHELL", product: productWhere(productId, by) },
    select: { id: true, videoKey: true },
  });
  if (!pm) throw new MaterialError("Choose the material first");
  if (!(await productHasFeature(productId, "materials")))
    throw new MaterialError("Materials are only for clothing");
  return pm;
}

export async function addMeasurement(
  productId: string,
  input: {
    kind: MeasureKind;
    value: number;
    lab: string;
    labName: string;
    accreditationNo: string;
    reportRef: string;
    testedOn: Date;
    report: { storageKey: string; contentType: string } | null;
  },
  by: By & { userId: string },
) {
  const pm = await ownPm(productId, by);
  const lab = input.lab
    ? await db.lab.findUnique({
        where: { code: input.lab },
        select: { id: true, name: true, accreditationNo: true, scope: true, scopeVerifiedOn: true },
      })
    : null;
  if (input.lab && !lab) throw new MaterialError("Choose the lab from the list");
  return db.$transaction(async (tx) => {
    const m = await tx.measurement.create({
      data: {
        productMaterialId: pm.id,
        testStandard: input.kind.testStandard as Prisma.MeasurementCreateInput["testStandard"],
        property: input.kind.property,
        unit: input.kind.unit,
        value: input.value,
        labId: lab?.id ?? null,
        labName: lab?.name ?? input.labName,
        labAccreditationNo: lab?.accreditationNo ?? (input.accreditationNo || null),
        accredited: isAccredited(lab, input.kind.testStandard),
        reportRef: input.reportRef || null,
        reportKey: input.report?.storageKey ?? null,
        reportType: input.report?.contentType ?? null,
        testedOn: input.testedOn,
        enteredById: by.userId,
      },
      select: { id: true, accredited: true },
    });
    await recomputeFeelProfile(tx, pm.id);
    return m;
  });
}

export async function deleteMeasurement(productId: string, measurementId: string, by: By) {
  const pm = await ownPm(productId, by);
  const m = await db.measurement.findFirst({
    where: { id: measurementId, productMaterialId: pm.id },
    select: { id: true, reportKey: true },
  });
  if (!m) throw new MaterialError("Result not found");
  await db.$transaction(async (tx) => {
    await tx.measurement.delete({ where: { id: m.id } });
    await recomputeFeelProfile(tx, pm.id);
  });
  if (m.reportKey) await storage().delete(m.reportKey);
}

export async function setMaterialVideo(
  productId: string,
  video: { storageKey: string; contentType: string } | null,
  by: By,
) {
  const pm = await ownPm(productId, by);
  await db.productMaterial.update({
    where: { id: pm.id },
    data: { videoKey: video?.storageKey ?? null, videoType: video?.contentType ?? null },
  });
  if (pm.videoKey) await storage().delete(pm.videoKey);
}

/** A library material's own feel estimate (no product gsm) and the evidence behind it, for admin */
export async function libraryProfile(code: string) {
  const m = await getMaterial(code);
  if (!m) return null;
  const composition = libraryComposition(m);
  const pm = { material: m, measurements: [], actualGsm: null } as unknown as PmRow;
  const evidence = await evidenceFor(db, pm, composition);
  const facts: FabricFacts = { ...factsOf(pm, evidence, composition), gsm: null, measurements: [] };
  const axes = computeProfile(facts, await calibrationValues());
  const rows = await db.evidence.findMany({
    where: { code: { in: evidence.map((e) => e.code) } },
    include: {
      source: { select: { code: true, title: true, publisher: true, url: true, tier: true } },
    },
    orderBy: [{ subjectType: "asc" }, { code: "asc" }],
  });
  const rules = await db.methodologyRule.findMany({
    where: {
      OR: axes.flatMap((a) => (a.rule ? [{ code: a.rule.code, version: a.rule.version }] : [])),
    },
    select: { code: true, version: true, ruleDescription: true, formula: true },
  });
  return { material: m, composition, axes, evidence: rows, rules };
}
