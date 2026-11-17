/**
 * Loads the material library seed files into the database (DEC-022). Safe on real data: upserts
 * by `code`, never deletes, never changes a material's DRAFT/PUBLISHED status, and refuses to
 * load while `checkLibrary` reports any unsourced value. Rules are append-only: a rule whose
 * code and version exist but whose text or numbers differ stops the load (bump the version).
 *
 * Used by `npm run materials:load`, the demo seed and integration tests.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { RULES, type Rule } from "@/lib/materials/rules";
import { allEvidence, checkLibrary, type LibrarySeed } from "@/lib/materials/seed";

type Tx = Prisma.TransactionClient;

const day = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);

export class LibraryLoadError extends Error {
  constructor(public problems: string[]) {
    super(`Material library not loaded:\n- ${problems.join("\n- ")}`);
  }
}

/** JSON with object keys sorted: Postgres jsonb does not keep key order */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]]))
      : x,
  );

function sameRule(r: Rule, row: { attribute: string; ruleDescription: string; formula: string; params: unknown }) {
  return (
    row.attribute === r.attribute &&
    row.ruleDescription === r.ruleDescription &&
    row.formula === r.formula &&
    stable(row.params) === stable(r.params)
  );
}

/** Inserts each rule version once; throws if a stored version differs from the code */
export async function loadRules(tx: Tx, rules: Rule[] = RULES) {
  const changed: string[] = [];
  for (const r of rules) {
    const row = await tx.methodologyRule.findUnique({
      where: { code_version: { code: r.code, version: r.version } },
    });
    if (!row)
      await tx.methodologyRule.create({
        data: {
          code: r.code,
          version: r.version,
          attribute: r.attribute,
          ruleDescription: r.ruleDescription,
          formula: r.formula,
          params: r.params as Prisma.InputJsonValue,
        },
      });
    else if (!sameRule(r, row)) changed.push(`rule ${r.code} v${r.version} differs from the stored version; give it a new version`);
  }
  if (changed.length) throw new LibraryLoadError(changed);
}

export async function loadLibrary(db: PrismaClient, lib: LibrarySeed) {
  const problems = checkLibrary(lib);
  if (problems.length) throw new LibraryLoadError(problems);
  const t = lib.taxonomy;

  return db.$transaction(
    async (tx) => {
      for (const s of lib.sources) {
        const data = {
          title: s.title,
          publisher: s.publisher,
          url: s.url,
          publishedYear: s.publishedYear,
          accessedOn: day(s.accessedOn),
          tier: s.tier,
          notes: s.notes,
        };
        await tx.source.upsert({ where: { code: s.code }, create: { code: s.code, ...data }, update: data });
      }
      const sourceId = new Map(
        (await tx.source.findMany({ select: { id: true, code: true } })).map((s) => [s.code, s.id]),
      );

      for (const f of t.fibers) {
        const { code, ...data } = f;
        await tx.fiber.upsert({ where: { code }, create: f, update: data });
      }
      for (const y of t.yarnProcesses) {
        const { code, ...data } = y;
        await tx.yarnProcess.upsert({ where: { code }, create: y, update: data });
      }
      for (const s of t.fiberStandards) {
        const { code, ...data } = s;
        await tx.fiberStandard.upsert({ where: { code }, create: s, update: data });
      }
      for (const c of t.constructions) {
        const { code, ...data } = c;
        await tx.construction.upsert({ where: { code }, create: c, update: data });
      }
      for (const f of t.finishes) {
        const { code, ...data } = f;
        await tx.finish.upsert({ where: { code }, create: f, update: data });
      }

      for (const e of allEvidence(lib)) {
        const data = {
          subjectType: e.subjectType,
          subjectCode: e.subjectCode,
          attribute: e.attribute,
          claim: e.claim,
          valueText: e.valueText,
          valueMin: e.valueMin,
          valueMax: e.valueMax,
          unit: e.unit,
          sourceId: sourceId.get(e.source)!,
          locator: e.locator,
          excerpt: e.excerpt,
        };
        await tx.evidence.upsert({ where: { code: e.code }, create: { code: e.code, ...data }, update: data });
      }

      for (const l of lib.labs) {
        const data = {
          name: l.name,
          city: l.city,
          accreditationNo: l.accreditationNo,
          scope: l.scope,
          scopeSourceId: l.scopeSource ? sourceId.get(l.scopeSource)! : null,
          scopeVerifiedOn: day(l.scopeVerifiedOn),
        };
        await tx.lab.upsert({ where: { code: l.code }, create: { code: l.code, ...data }, update: data });
      }

      const ids = async <T extends { id: string; code: string }>(rows: Promise<T[]>) =>
        new Map((await rows).map((r) => [r.code, r.id]));
      const sel = { select: { id: true, code: true } };
      const construction = await ids(tx.construction.findMany(sel));
      const yarn = await ids(tx.yarnProcess.findMany(sel));
      const finish = await ids(tx.finish.findMany(sel));
      const fiber = await ids(tx.fiber.findMany(sel));
      const standard = await ids(tx.fiberStandard.findMany(sel));

      for (const m of lib.materials) {
        const data = {
          displayName: m.displayName,
          constructionId: construction.get(m.construction)!,
          yarnProcessId: m.yarnProcess ? yarn.get(m.yarnProcess)! : null,
          finishId: finish.get(m.finish)!,
          defaultGsmMin: m.gsm?.[0] ?? null,
          defaultGsmMax: m.gsm?.[1] ?? null,
          stretchType: m.stretchType,
          feelsLikeAnchor: m.feelsLikeAnchor,
          endUses: m.endUses,
        };
        const row = await tx.material.upsert({
          where: { code: m.code },
          create: { code: m.code, ...data },
          update: data,
          select: { id: true },
        });
        await tx.materialFiber.deleteMany({ where: { materialId: row.id } });
        await tx.materialFiber.createMany({
          data: m.fibers.map((f) => ({
            materialId: row.id,
            fiberId: fiber.get(f.fiber)!,
            fiberStandardId: f.standard ? standard.get(f.standard)! : null,
            percentage: f.pct,
          })),
        });
      }

      await loadRules(tx);
      return { materials: lib.materials.length, evidence: allEvidence(lib).length, sources: lib.sources.length };
    },
    { timeout: 120_000 },
  );
}
