/**
 * Material library seed files (DEC-022): shapes and the provenance check. Pure: callers read
 * the JSON. `checkLibrary` returns every problem; the loader refuses to load while any exist and
 * a unit test fails on them, so an unsourced number cannot reach the database.
 */
import { z } from "zod";
import { ruleEvidenceCodes } from "./rules";
import type { EvidenceLite, FabricFacts } from "./types";

const code = z.string().regex(/^[A-Za-z0-9_-]+$/);
const num = z.number().finite().nullable().default(null);
const text = z.string().min(1).nullable().default(null);

export const TEST_STANDARDS = [
  "KES_FB2_BENDING", "KES_FB4_SURFACE", "KES_FB3_COMPRESSION", "AATCC_TM202", "AATCC_TM218",
  "ASTM_D1388", "FAST2", "ISO_3801", "EN_12127", "ASTM_D3776", "ISO_9237", "ASTM_D737",
  "ISO_11092", "AATCC_TM195", "AATCC_TM199", "ISO_20932_1", "ASTM_D2594", "ASTM_D3107",
  "ISO_5077", "AATCC_TM135", "ISO_12945_2", "ISO_12947_2", "BS_5058", "AATCC_TM128",
  "AATCC_EP5_PANEL",
] as const;

export const sourceSchema = z.object({
  code,
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.string().url(),
  publishedYear: z.number().int().nullable().default(null),
  accessedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  tier: z.enum(["A", "B", "C"]),
  notes: text,
});

const evidenceBody = {
  code,
  attribute: z.string().min(1),
  claim: z.string().min(1),
  valueText: text,
  valueMin: num,
  valueMax: num,
  unit: text,
  source: code,
  locator: text,
  excerpt: z.string().min(1).max(300).nullable().default(null),
};

export const SUBJECTS = ["FIBER", "YARN_PROCESS", "FIBER_STANDARD", "CONSTRUCTION", "FINISH", "MATERIAL", "LAB"] as const;
/** Evidence about the topic in general (a method, a study-wide finding), not one row */
export const GENERAL = "_general";

export const evidenceSchema = z.object({
  ...evidenceBody,
  subjectType: z.enum(SUBJECTS),
  subjectCode: z.string().min(1),
});

export const taxonomySchema = z.object({
  fibers: z.array(
    z.object({
      code,
      name: z.string().min(1),
      family: z.enum(["NATURAL_PLANT", "NATURAL_ANIMAL", "REGENERATED_CELLULOSIC", "SYNTHETIC"]),
      speciesOrPolymer: text,
      stapleLengthMmMin: num,
      stapleLengthMmMax: num,
      moistureRegainPct: num,
      notes: text,
    }),
  ),
  yarnProcesses: z.array(z.object({ code, name: z.string().min(1), description: text })),
  fiberStandards: z.array(z.object({ code, name: z.string().min(1), certifyingBody: text })),
  constructions: z.array(
    z.object({
      code,
      name: z.string().min(1),
      category: z.enum(["WEFT_KNIT", "WARP_KNIT", "WOVEN", "OTHER"]),
      structureDescription: text,
      typicalGsmMin: z.number().int().positive().nullable().default(null),
      typicalGsmMax: z.number().int().positive().nullable().default(null),
      typicalEndUses: z.array(z.string()).default([]),
    }),
  ),
  finishes: z.array(z.object({ code, name: z.string().min(1), effectDescription: text })),
});

export const materialSchema = z.object({
  code,
  displayName: z.string().min(1),
  construction: code,
  yarnProcess: code.nullable(),
  finish: code,
  gsm: z.tuple([z.number().int().positive(), z.number().int().positive()]).nullable(),
  stretchType: z.enum(["NONE", "MECHANICAL", "TWO_WAY", "FOUR_WAY"]).nullable(),
  feelsLikeAnchor: text,
  endUses: z.array(z.string()),
  fibers: z
    .array(z.object({ fiber: code, standard: code.nullable(), pct: z.number().int().min(1).max(100) }))
    .min(1),
  evidence: z.array(z.object(evidenceBody)),
  todo: z.array(z.string()).default([]),
});

export const labSchema = z.object({
  code,
  name: z.string().min(1),
  city: text,
  accreditationNo: text,
  scope: z.array(z.enum(TEST_STANDARDS)),
  scopeSource: code.nullable(),
  /** Date GroupBasket read the current scope; required before `scope` lists anything */
  scopeVerifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  notes: text,
});

export type SourceSeed = z.infer<typeof sourceSchema>;
export type EvidenceSeed = z.infer<typeof evidenceSchema>;
export type TaxonomySeed = z.infer<typeof taxonomySchema>;
export type MaterialSeed = z.infer<typeof materialSchema>;
export type LabSeed = z.infer<typeof labSchema>;

export type LibrarySeed = {
  sources: SourceSeed[];
  evidence: EvidenceSeed[];
  taxonomy: TaxonomySeed;
  materials: MaterialSeed[];
  labs: LabSeed[];
};

/** Parse raw JSON values; throws a ZodError naming the bad file entry */
export function parseLibrary(raw: {
  sources: unknown;
  evidence: unknown;
  taxonomy: unknown;
  materials: unknown[];
  labs: unknown;
}): LibrarySeed {
  return {
    sources: z.array(sourceSchema).parse(raw.sources),
    evidence: z.array(evidenceSchema).parse(raw.evidence),
    taxonomy: taxonomySchema.parse(raw.taxonomy),
    materials: raw.materials.map((m) => materialSchema.parse(m)),
    labs: z.array(labSchema).parse(raw.labs),
  };
}

/** All evidence, with each material's own rows given the material as subject */
export function allEvidence(lib: LibrarySeed): EvidenceSeed[] {
  return [
    ...lib.evidence,
    ...lib.materials.flatMap((m) =>
      m.evidence.map((e) => ({ ...e, subjectType: "MATERIAL" as const, subjectCode: m.code })),
    ),
  ];
}

export function toLite(e: EvidenceSeed): EvidenceLite {
  return {
    code: e.code,
    subjectType: e.subjectType,
    subjectCode: e.subjectCode,
    attribute: e.attribute,
    valueText: e.valueText,
    valueMin: e.valueMin,
    valueMax: e.valueMax,
    verified: e.excerpt != null,
  };
}

function dupes(label: string, codes: string[], out: string[]) {
  const seen = new Set<string>();
  for (const c of codes) {
    if (seen.has(c)) out.push(`${label}: duplicate code ${c}`);
    seen.add(c);
  }
}

export function checkLibrary(lib: LibrarySeed): string[] {
  const p: string[] = [];
  const t = lib.taxonomy;
  const ev = allEvidence(lib);
  const verified = ev.filter((e) => e.excerpt != null);

  dupes("sources", lib.sources.map((s) => s.code), p);
  dupes("evidence", ev.map((e) => e.code), p);
  dupes("materials", lib.materials.map((m) => m.code), p);
  dupes("labs", lib.labs.map((l) => l.code), p);
  for (const [k, rows] of Object.entries(t)) dupes(k, (rows as { code: string }[]).map((r) => r.code), p);

  const subjects: Record<(typeof SUBJECTS)[number], Set<string>> = {
    FIBER: new Set(t.fibers.map((x) => x.code)),
    YARN_PROCESS: new Set(t.yarnProcesses.map((x) => x.code)),
    FIBER_STANDARD: new Set(t.fiberStandards.map((x) => x.code)),
    CONSTRUCTION: new Set(t.constructions.map((x) => x.code)),
    FINISH: new Set(t.finishes.map((x) => x.code)),
    MATERIAL: new Set(lib.materials.map((x) => x.code)),
    LAB: new Set(lib.labs.map((x) => x.code)),
  };
  const sources = new Set(lib.sources.map((s) => s.code));

  for (const e of ev) {
    if (!sources.has(e.source)) p.push(`evidence ${e.code}: unknown source ${e.source}`);
    if (e.subjectCode !== GENERAL && !subjects[e.subjectType].has(e.subjectCode))
      p.push(`evidence ${e.code}: unknown ${e.subjectType} ${e.subjectCode}`);
    if (e.valueMin != null && e.valueMax != null && e.valueMin > e.valueMax)
      p.push(`evidence ${e.code}: valueMin above valueMax`);
    if (e.excerpt != null && !e.locator) p.push(`evidence ${e.code}: quoted without a locator`);
  }

  const evCodes = new Set(ev.map((e) => e.code));
  for (const c of ruleEvidenceCodes()) if (!evCodes.has(c)) p.push(`rules cite missing evidence ${c}`);

  /** A stored number or text needs a verified row on the same subject and attribute that matches */
  const backed = (type: string, subject: string, attribute: string, ok: (e: EvidenceSeed) => boolean) =>
    verified.some((e) => e.subjectType === type && e.subjectCode === subject && e.attribute === attribute && ok(e));
  const within = (v: number, e: EvidenceSeed) =>
    e.valueMin != null && v >= e.valueMin && v <= (e.valueMax ?? e.valueMin);

  for (const f of t.fibers) {
    if (f.moistureRegainPct != null && !backed("FIBER", f.code, "moisture_regain_pct", (e) => within(f.moistureRegainPct!, e)))
      p.push(`fiber ${f.code}: moistureRegainPct has no matching verified evidence`);
    if ((f.stapleLengthMmMin != null || f.stapleLengthMmMax != null) &&
      !backed("FIBER", f.code, "staple_length_mm", (e) => e.valueMin === f.stapleLengthMmMin && e.valueMax === f.stapleLengthMmMax))
      p.push(`fiber ${f.code}: staple length has no matching verified evidence`);
    if (f.speciesOrPolymer != null && !backed("FIBER", f.code, "species_or_polymer", (e) => e.valueText === f.speciesOrPolymer))
      p.push(`fiber ${f.code}: speciesOrPolymer has no matching verified evidence`);
  }
  for (const c of t.constructions) {
    if ((c.typicalGsmMin != null || c.typicalGsmMax != null) &&
      !backed("CONSTRUCTION", c.code, "typical_gsm", (e) => e.valueMin === c.typicalGsmMin && e.valueMax === c.typicalGsmMax))
      p.push(`construction ${c.code}: typical gsm has no matching verified evidence`);
    for (const u of c.typicalEndUses)
      if (!backed("CONSTRUCTION", c.code, "end_use", (e) => e.valueText === u))
        p.push(`construction ${c.code}: end use "${u}" has no verified evidence`);
  }

  for (const m of lib.materials) {
    const at = `material ${m.code}`;
    if (!subjects.CONSTRUCTION.has(m.construction)) p.push(`${at}: unknown construction ${m.construction}`);
    if (m.yarnProcess && !subjects.YARN_PROCESS.has(m.yarnProcess)) p.push(`${at}: unknown yarn ${m.yarnProcess}`);
    if (!subjects.FINISH.has(m.finish)) p.push(`${at}: unknown finish ${m.finish}`);
    const sum = m.fibers.reduce((s, f) => s + f.pct, 0);
    if (sum !== 100) p.push(`${at}: composition sums to ${sum}, not 100`);
    for (const f of m.fibers) {
      if (!subjects.FIBER.has(f.fiber)) p.push(`${at}: unknown fiber ${f.fiber}`);
      if (f.standard && !subjects.FIBER_STANDARD.has(f.standard)) p.push(`${at}: unknown standard ${f.standard}`);
    }
    if (m.gsm) {
      const [lo, hi] = m.gsm;
      if (lo > hi) p.push(`${at}: gsm range reversed`);
      if (!backed("MATERIAL", m.code, "typical_gsm", (e) => e.valueMin === lo && e.valueMax === hi))
        p.push(`${at}: gsm range has no matching verified evidence`);
    }
    if (m.feelsLikeAnchor && !backed("MATERIAL", m.code, "feels_like", () => true))
      p.push(`${at}: feelsLikeAnchor has no verified feels_like evidence`);
    if (m.stretchType && !backed("MATERIAL", m.code, "stretch_type", (e) => e.valueText === m.stretchType))
      p.push(`${at}: stretchType has no verified evidence`);
    for (const u of m.endUses)
      if (!backed("MATERIAL", m.code, "end_use", (e) => e.valueText === u)) p.push(`${at}: end use "${u}" unsourced`);
  }

  for (const l of lib.labs) {
    if (l.scopeSource && !sources.has(l.scopeSource)) p.push(`lab ${l.code}: unknown scope source`);
    if (l.scope.length && !l.scopeVerifiedOn) p.push(`lab ${l.code}: scope listed without a verified date`);
  }
  return p;
}

/** For the owner's summary: evidence rows still waiting for a quote, and tier-C-only subjects */
export function evidenceReport(lib: LibrarySeed) {
  const ev = allEvidence(lib);
  const tier = new Map(lib.sources.map((s) => [s.code, s.tier]));
  const bySubject = new Map<string, string[]>();
  for (const e of ev.filter((x) => x.excerpt != null)) {
    const k = `${e.subjectType}:${e.subjectCode}`;
    bySubject.set(k, [...(bySubject.get(k) ?? []), tier.get(e.source) ?? "?"]);
  }
  return {
    unverified: ev.filter((e) => e.excerpt == null).map((e) => `${e.code} (${e.source})`),
    tierCOnly: [...bySubject].filter(([, ts]) => ts.every((x) => x === "C")).map(([k]) => k),
  };
}

/**
 * Feel facts for one library material, as the service builds them from the database: its own
 * evidence plus its construction, yarn, finish and fibres, and every rule-cited row.
 */
export function libraryFacts(lib: LibrarySeed, code: string, gsm: number | null): FabricFacts {
  const m = lib.materials.find((x) => x.code === code);
  if (!m) throw new Error(`unknown material ${code}`);
  const c = lib.taxonomy.constructions.find((x) => x.code === m.construction)!;
  const subjects = new Set([
    `MATERIAL:${m.code}`,
    `CONSTRUCTION:${m.construction}`,
    `FINISH:${m.finish}`,
    `YARN_PROCESS:${m.yarnProcess}`,
    ...m.fibers.map((f) => `FIBER:${f.fiber}`),
  ]);
  const cited = new Set(ruleEvidenceCodes());
  return {
    materialCode: m.code,
    constructionCode: m.construction,
    constructionCategory: c.category,
    yarnProcessCode: m.yarnProcess,
    finishCode: m.finish,
    fibers: m.fibers.map((f) => ({ fiber: f.fiber, standard: f.standard, pct: f.pct })),
    gsm,
    gsmRange: m.gsm,
    evidence: allEvidence(lib)
      .filter((e) => subjects.has(`${e.subjectType}:${e.subjectCode}`) || cited.has(e.code))
      .map(toLite),
    measurements: [],
  };
}
