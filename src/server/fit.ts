import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { FitClass } from "@/lib/fit/config";
import { fitClass, readBody, readChart, sizeOrder } from "@/lib/fit/data";
import { isShort } from "@/lib/fit/drape";
import { fitReport, nearestArchetype, type Body, type FitReport } from "@/lib/fit/report";
import { isRegion, regionFromEnum, REGIONS, type Region } from "@/lib/fit/regions";
import { deleteBody, outlinesSchema, queueBodyFit } from "./body-fit";
import { db } from "./db";
import { AppError } from "./errors";

export class FitError extends AppError {}

// ─── Fit data on a product (factory enters, admin approves; DEC-020) ─────────

type FitFields = {
  chart: Record<string, Partial<Record<Region, number>>>;
  fabricStretchPct: number | null;
  gsm: number | null;
  weave: string | null;
  thermalMinC: number | null;
  thermalMaxC: number | null;
  breathability: number | null;
  careNotes: string | null;
};

/**
 * Saves a product's size chart and fabric details. A factory (`sellerId`) edits only its own
 * listing and any change clears the approval; an admin's save approves it.
 */
export async function saveFitData(
  productId: string,
  fields: FitFields,
  by: { sellerId: string } | { adminId: string },
) {
  const where =
    "sellerId" in by
      ? { id: productId, sellerId: by.sellerId, seller: { isBrand: false } }
      : { id: productId, OR: [{ sellerId: null }, { seller: { isBrand: false } }] };
  if (!(await db.product.count({ where }))) throw new FitError("Product not found");
  const { chart, ...fabric } = fields;
  await db.product.update({
    where: { id: productId },
    data: {
      ...fabric,
      sizeChart: Object.keys(chart).length ? chart : Prisma.DbNull,
      ...("adminId" in by
        ? { fitApprovedAt: new Date(), fitApprovedById: by.adminId }
        : { fitApprovedAt: null, fitApprovedById: null }),
    },
  });
}

export async function setFitApproved(adminId: string, productId: string, approved: boolean) {
  const p = await db.product.findFirst({
    where: { id: productId, OR: [{ sellerId: null }, { seller: { isBrand: false } }] },
    select: { sizeChart: true },
  });
  if (!p) throw new FitError("Product not found");
  if (approved && !Object.keys(readChart(p.sizeChart)).length)
    throw new FitError("There is no size chart to approve");
  await db.product.update({
    where: { id: productId },
    data: approved
      ? { fitApprovedAt: new Date(), fitApprovedById: adminId }
      : { fitApprovedAt: null, fitApprovedById: null },
  });
}

// ─── The buyer's body profile ─────────────────────────────────────────────

const measure = z.object({
  value: z.number().positive().max(300),
  low: z.number().positive().max(300),
  high: z.number().positive().max(300),
  source: z.enum(["photo", "typed"]),
});

const profileSchema = z.object({
  heightCm: z.number().min(100, "Enter your height in cm").max(230, "Enter your height in cm"),
  gender: z.enum(["MEN", "WOMEN"]).nullable(),
  ageBand: z.enum(["18-29", "30-44", "45-59", "60+"]).nullable(),
  measurements: z.record(z.string(), measure),
  captureMeta: z.record(z.string(), z.unknown()).nullable(),
  consent: z.literal(true, { message: "Agree to saving your measurements" }),
  /** New photos' outlines and joints (never the photos), for the buyer's 3D body (DEC-021). */
  outlines: outlinesSchema.nullable().optional(),
});

export type ProfileInput = z.input<typeof profileSchema>;

/** Saves the buyer's own measurements (never photos) and their nearest archetype. */
export async function saveBodyProfile(userId: string, input: unknown) {
  const p = profileSchema.parse(input);
  const measurements = Object.fromEntries(
    Object.entries(p.measurements)
      .filter(([k]) => isRegion(k))
      .map(([k, m]) => [
        k,
        { ...m, low: Math.min(m.low, m.value), high: Math.max(m.high, m.value) },
      ]),
  );
  const body = readBody(measurements);
  if (!Object.keys(body).length) throw new FitError("Enter at least one measurement");
  const archetypes = await db.bodyArchetype.findMany({
    select: { id: true, gender: true, params: true },
  });
  const nearest = nearestArchetype(
    body,
    archetypes.map((a) => ({ ...a, params: archetypeParams(a.params) })),
    p.gender,
  );
  const data = {
    heightCm: p.heightCm,
    gender: p.gender,
    ageBand: p.ageBand,
    measurements,
    captureMeta: (p.captureMeta ?? undefined) as Prisma.InputJsonValue | undefined,
    archetypeId: nearest?.id ?? null,
    consentAt: new Date(),
  };
  return db.$transaction(async (tx) => {
    const saved = await tx.bodyProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    if (p.outlines) await queueBodyFit(tx, userId, saved, p.outlines);
    return saved;
  });
}

export async function deleteBodyProfile(userId: string) {
  await deleteBody(userId);
  return db.bodyProfile.deleteMany({ where: { userId } });
}

export const getBodyProfile = (userId: string) =>
  db.bodyProfile.findUnique({
    where: { userId },
    select: {
      heightCm: true,
      gender: true,
      ageBand: true,
      measurements: true,
      consentAt: true,
      updatedAt: true,
      archetype: { select: { name: true } },
    },
  });

function archetypeParams(json: unknown): Partial<Record<Region, number>> {
  const out: Partial<Record<Region, number>> = {};
  if (json && typeof json === "object")
    for (const [k, v] of Object.entries(json as Record<string, unknown>))
      if (isRegion(k) && typeof v === "number") out[k] = v;
  return out;
}

// ─── The product page fit module ──────────────────────────────────────────

export interface FitView {
  /** Fabric and care, shown whenever the factory gave any. */
  material: {
    gsm: number | null;
    weave: string | null;
    stretchPct: number | null;
    thermalMinC: number | null;
    thermalMaxC: number | null;
    breathability: number | null;
    careNotes: string | null;
  } | null;
  /** Approved garment measurements, sizes smallest first. */
  chart: {
    sizes: string[];
    regions: Region[];
    cells: Record<string, Partial<Record<Region, number>>>;
  } | null;
  hasProfile: boolean;
  report: FitReport | null;
  /** The simulated garment on the buyer's archetype, per motion. */
  assets: { motion: "WALK" | "RUN" | "REACH" | "SIT"; url: string }[];
  /** The buyer's confirmed own 3D body (DEC-021): the garment is drawn over it in the browser. */
  personal: { url: string; fitClass: FitClass; short: boolean; animated: boolean } | null;
}

/**
 * Everything the fit module needs, in one load: every size's tensions are computed here so the
 * size switch recolours without another request. Only approved size charts are used.
 */
export async function getFitView(productId: string, userId: string | null): Promise<FitView> {
  const [product, profile] = await Promise.all([
    db.product.findUnique({
      where: { id: productId },
      select: {
        kind: true,
        sizeChart: true,
        fitApprovedAt: true,
        fabricStretchPct: true,
        gsm: true,
        weave: true,
        thermalMinC: true,
        thermalMaxC: true,
        breathability: true,
        careNotes: true,
        variants: { select: { size: true } },
      },
    }),
    userId
      ? db.bodyProfile.findUnique({
          where: { userId },
          select: {
            measurements: true,
            archetypeId: true,
            archetype: { select: { params: true } },
            bodyStatus: true,
            bodyFit: true,
            bodyFitAt: true,
          },
        })
      : null,
  ]);
  if (!product)
    return {
      material: null,
      chart: null,
      hasProfile: !!profile,
      report: null,
      assets: [],
      personal: null,
    };
  const { sizeChart, fitApprovedAt, kind, variants, fabricStretchPct, ...rest } = product;
  const material = [fabricStretchPct, ...Object.values(rest)].some((v) => v !== null)
    ? { ...rest, stretchPct: fabricStretchPct }
    : null;
  const cells = fitApprovedAt ? readChart(sizeChart) : {};
  const sizes = sizeOrder(kind, [...variants.map((v) => v.size), ...Object.keys(cells)]).filter(
    (s) => cells[s],
  );
  const chart = sizes.length
    ? {
        sizes,
        regions: REGIONS.filter((r) => sizes.some((s) => cells[s][r] !== undefined)),
        cells,
      }
    : null;
  if (!chart || !profile)
    return { material, chart, hasProfile: !!profile, report: null, assets: [], personal: null };

  const [tensions, assets] = profile.archetypeId
    ? await Promise.all([
        db.garmentRegionTension.findMany({
          where: { productId, archetypeId: profile.archetypeId },
          select: { size: true, region: true, baseTension: true },
        }),
        db.fitAsset.findMany({
          where: { productId, archetypeId: profile.archetypeId },
          select: { motion: true, gltfUrl: true },
          orderBy: { motion: "asc" },
        }),
      ])
    : [[], []];
  const base: Record<string, Partial<Record<Region, number>>> = {};
  for (const t of tensions) (base[t.size] ??= {})[regionFromEnum(t.region)] = t.baseTension;
  const body: Body = readBody(profile.measurements);
  const report = fitReport({
    body,
    sizes: chart.sizes,
    chart: cells,
    stretchPct: fabricStretchPct ?? 0,
    fitClass: fitClass(kind),
    archetype: profile.archetype ? archetypeParams(profile.archetype.params) : null,
    base: tensions.length ? base : null,
  });
  return {
    material,
    chart,
    hasProfile: true,
    report,
    assets: assets.map((a) => ({ motion: a.motion, url: a.gltfUrl })),
    personal:
      profile.bodyStatus === "CONFIRMED"
        ? {
            url: `/api/fit-body?v=${profile.bodyFitAt?.getTime().toString(36) ?? "0"}`,
            fitClass: fitClass(kind),
            short: isShort(kind),
            animated: ((profile.bodyFit as { bodyVersion?: number } | null)?.bodyVersion ?? 1) >= 2,
          }
        : null,
  };
}

// ─── "How did it fit?" (DEC-020) ──────────────────────────────────────────

const feedbackSchema = z.object({
  orderLineId: z.string().min(1),
  verdict: z.enum(["TOO_TIGHT", "GOOD", "TOO_LOOSE"], { message: "Choose how it fitted" }),
  regionNotes: z.record(z.string(), z.enum(["TOO_TIGHT", "GOOD", "TOO_LOOSE"])).default({}),
});

/** The buyer's own collected line, once. Stores the size they would have been recommended. */
export async function saveFitFeedback(userId: string, input: unknown) {
  const f = feedbackSchema.parse(input);
  const line = await db.orderLine.findFirst({
    where: { id: f.orderLineId, order: { buyerId: userId }, collectedAt: { not: null } },
    select: {
      variant: { select: { size: true, productId: true } },
      fitFeedback: { select: { id: true } },
    },
  });
  if (!line) throw new FitError("Order line not found");
  if (line.fitFeedback) throw new FitError("You have already told us how it fitted");
  const view = await getFitView(line.variant.productId, userId);
  const regionNotes = Object.fromEntries(
    Object.entries(f.regionNotes).filter(([k]) => isRegion(k)),
  );
  await db.fitFeedback.create({
    data: {
      userId,
      productId: line.variant.productId,
      orderLineId: f.orderLineId,
      purchasedSize: line.variant.size,
      verdict: f.verdict,
      regionNotes: Object.keys(regionNotes).length ? regionNotes : undefined,
      recommended: view.report?.recommendedSize ?? null,
    },
  });
}

/** Collected lines of fitted products still waiting for the buyer's fit feedback. */
export function linesAwaitingFit(
  userId: string,
  { orderId, take = 20 }: { orderId?: string; take?: number } = {},
) {
  return db.orderLine.findMany({
    where: {
      order: { buyerId: userId, ...(orderId ? { id: orderId } : {}) },
      collectedAt: { not: null },
      status: "ACTIVE",
      fitFeedback: null,
      variant: { product: { fitApprovedAt: { not: null } } },
    },
    orderBy: { collectedAt: "desc" },
    take,
    select: {
      id: true,
      variant: {
        select: { size: true, product: { select: { id: true, title: true, kind: true } } },
      },
    },
  });
}

/** Products whose factory fit data waits for an admin's check. */
export const fitAwaitingCheck = () =>
  db.product.findMany({
    where: { fitApprovedAt: null, sizeChart: { not: Prisma.DbNull }, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "asc" },
    take: 100,
    select: {
      id: true,
      title: true,
      brand: true,
      seller: { select: { company: true, name: true } },
    },
  });

/** Per product: feedback count, share GOOD, and how often the bought size was the recommended one. */
export async function fitAccuracy() {
  const rows = await db.fitFeedback.groupBy({
    by: ["productId", "verdict"],
    _count: { _all: true },
  });
  const matched = await db.$queryRaw<{ productId: string; matched: bigint; good: bigint }[]>`
    SELECT "productId",
           COUNT(*) FILTER (WHERE "recommended" = "purchasedSize") AS matched,
           COUNT(*) FILTER (WHERE "recommended" = "purchasedSize" AND "verdict" = 'GOOD') AS good
    FROM "FitFeedback" GROUP BY "productId"`;
  const ids = [...new Set(rows.map((r) => r.productId))];
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, brand: true },
  });
  return products
    .map((p) => {
      const count = (v: string) =>
        rows.find((r) => r.productId === p.id && r.verdict === v)?._count._all ?? 0;
      const total = count("TOO_TIGHT") + count("GOOD") + count("TOO_LOOSE");
      const m = matched.find((x) => x.productId === p.id);
      return {
        ...p,
        total,
        tight: count("TOO_TIGHT"),
        good: count("GOOD"),
        loose: count("TOO_LOOSE"),
        recommendedBought: Number(m?.matched ?? 0),
        recommendedGood: Number(m?.good ?? 0),
      };
    })
    .sort((a, b) => b.total - a.total);
}
