/**
 * Factory admin side of the material library (DEC-022): publishing materials, clearing products
 * whose figures are far from the library, and the reports. Library content itself (sources,
 * evidence, materials, rules) is edited in `seeds/` and loaded with `npm run materials:load`, so
 * every change is reviewed in git; these pages read it.
 */
import "server-only";
import { db } from "./db";
import { MaterialError } from "./materials";

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
        material: { select: { code: true, displayName: true, defaultGsmMin: true, defaultGsmMax: true } },
      },
    }),
    db.productMaterial.findMany({
      where: { verificationLevel: "LIBRARY_ESTIMATE" },
      select: { id: true, product: { select: { id: true, title: true } }, material: { select: { displayName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.feelAxis.groupBy({ by: ["axis"], where: { basis: "NOT_AVAILABLE" }, _count: true }),
    db.evidence.findMany({
      select: { code: true, subjectType: true, subjectCode: true, excerpt: true, source: { select: { tier: true } } },
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
    where: subject
      ? { subjectType: subject.type as never, subjectCode: subject.code }
      : undefined,
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
    include: { swatches: { include: { material: { select: { code: true } }, _count: { select: { measurements: true } } } } },
  });
}
