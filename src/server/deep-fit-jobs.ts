/**
 * Deep Fit Test (DEC-021): the job queue the sim worker (`npm run sim:worker`) works through. One
 * job cloth-simulates one garment, every chart size, on the buyer's own confirmed body. No
 * "server-only" import, so the command-line worker can use it with its own client.
 *
 * A job is valid only for the body it ran on (`bodyFitAt`) and the product's fit data
 * (`fitDataHash`): a result finished after the buyer rebuilt their body is discarded. Garment files
 * are private, at `deep-fit/<userId>/<jobId>/<size>.glb`, and are swept 90 days after creation.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { fitClass, readChart } from "@/lib/fit/data";
import { isShort } from "@/lib/fit/drape";
import { MAX_ATTEMPTS } from "./body-fit-jobs";
import type { Storage } from "./storage/local";

export { MAX_ATTEMPTS };
/** Each size's time in tools/cloth-sim/run.py (`timeout_s`), and Blender start-up on top. */
export const SIM_SIZE_TIMEOUT_MS = 10 * 60 * 1000;
export const SIM_MARGIN_MS = 5 * 60 * 1000;
/** Sizes counted towards the worker's timeout; run.py simulates sizes in parallel. */
export const MAX_SIM_SIZES = 12;
/** The sim worker's timeout for a garment with this many sizes. */
export const simTimeoutMs = (sizes: number) =>
  Math.min(Math.max(1, sizes), MAX_SIM_SIZES) * SIM_SIZE_TIMEOUT_MS + SIM_MARGIN_MS;
/**
 * A RUNNING Deep Fit Test not finished in this time belongs to a crashed worker and is taken
 * again. Longer than the worker's longest timeout, so a live worker's job is never taken.
 */
export const DEEP_FIT_STALE_MS = simTimeoutMs(MAX_SIM_SIZES) + 15 * 60 * 1000;
/** Failures that are not the test's fault: they don't count against the 5 a day. */
export const DROPPED_ERRORS = ["body changed", "fit data changed"] as const;
export const DEEP_FIT_PER_DAY = 5;
export const DEEP_FIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEEP_FIT_KEEP_MS = 90 * 24 * 60 * 60 * 1000;
export const DEEP_FIT_MOTIONS = ["WALK", "RUN", "REACH", "SIT"] as const;

/** The product fields a simulation depends on. */
export interface FitDataFields {
  kind: string | null;
  sizeChart: unknown;
  fabricStretchPct: number | null;
  gsm: number | null;
  weave: string | null;
}

export const FIT_DATA_SELECT = {
  kind: true,
  sizeChart: true,
  fabricStretchPct: true,
  gsm: true,
  weave: true,
  fitApprovedAt: true,
} as const;

const stable = (v: unknown): unknown =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
      )
    : v;

/** SHA-256 of the product's size chart and fabric fields: a change makes old results stale. */
export function fitDataHash(p: FitDataFields): string {
  const data = stable({
    kind: p.kind,
    chart: readChart(p.sizeChart),
    stretchPct: p.fabricStretchPct,
    gsm: p.gsm,
    weave: p.weave,
  });
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/** What one simulation needs; the body file comes from storage, never a path the app chose. */
export interface SimInput {
  body: Uint8Array;
  cls: string;
  short: boolean;
  sizes: Record<string, Record<string, number>>;
  fabric: { gsm: number | null; stretch_pct: number | null; weave: string | null };
  motions: string[];
}

export interface SimSize {
  /** 0 (loose) to 1 (at the fabric's limit), per area. */
  tension: Record<string, number>;
  /** The garment file's name, relative to the run's out_dir. */
  garment?: string;
  /** "unstable": the size exploded or timed out; every area reports 1. */
  note?: string;
}

export interface SimResult {
  status: "ok" | "failed";
  sizes: Record<string, SimSize>;
  seconds: number;
}

/** Runs the cloth simulation; garments maps size to the simulated garment file's bytes. */
export type SimRunner = (
  input: SimInput,
) => Promise<{ result: SimResult; garments: Record<string, Uint8Array> }>;

/** Stored in DeepFitJob.result. */
export interface DeepFitResult {
  sizes: Record<
    string,
    { tension: Record<string, number>; garmentKey: string | null; note?: string }
  >;
  seconds: number;
}

export interface ClaimedDeepFit {
  id: string;
  userId: string;
  productId: string;
  attempts: number;
  bodyFitAt: Date;
  fitDataHash: string;
  createdAt: Date;
  /** When this worker took it: a later value means another worker has taken it over. */
  startedAt: Date;
}

/**
 * Takes the oldest queued (or stale running) job; safe with several workers. A stale job that
 * has had all its attempts fails, and the buyer is told.
 */
export async function claimDeepFit(
  db: PrismaClient,
  now = new Date(),
): Promise<ClaimedDeepFit | null> {
  const stale = new Date(now.getTime() - DEEP_FIT_STALE_MS);
  const spent = await db.$queryRaw<ClaimedDeepFit[]>`
    UPDATE "DeepFitJob" SET status = 'FAILED', error = 'timed out', "updatedAt" = ${now}
    WHERE status = 'RUNNING' AND "startedAt" < ${stale} AND attempts >= ${MAX_ATTEMPTS}
    RETURNING id, "userId", "productId"`;
  if (spent.length)
    await db.notification.createMany({
      data: spent.map((j) => notice(j, false)),
      skipDuplicates: true,
    });
  const rows = await db.$queryRaw<ClaimedDeepFit[]>`
    UPDATE "DeepFitJob" SET status = 'RUNNING', attempts = attempts + 1, "startedAt" = ${now},
      "updatedAt" = ${now}
    WHERE id = (
      SELECT id FROM "DeepFitJob"
      WHERE status = 'QUEUED'
        OR (status = 'RUNNING' AND "startedAt" < ${stale} AND attempts < ${MAX_ATTEMPTS})
      ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id, "userId", "productId", attempts, "bodyFitAt", "fitDataHash", "createdAt",
      "startedAt"`;
  return rows[0] ?? null;
}

export const garmentKey = (userId: string, jobId: string, size: string) =>
  `deep-fit/${userId}/${jobId}/${size}.glb`;

/** A size name tools/cloth-sim/run.py accepts (its `SIZE_NAME`): also a safe file name. */
const SIZE_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,31}$/;
export const isSizeName = (size: string) => SIZE_NAME.test(size);

const notice = (job: Pick<ClaimedDeepFit, "id" | "userId" | "productId">, ok: boolean) => ({
  id: `deep-fit:${job.id}`,
  userId: job.userId,
  title: ok ? "Your Deep Fit Test is ready" : "We couldn't finish your Deep Fit Test",
  body: ok ? "See how it fits on your body." : "Try again later.",
  href: `/products/${job.productId}`,
});

/** The job's body and fit data are still the buyer's current ones. */
async function stillCurrent(db: Prisma.TransactionClient | PrismaClient, job: ClaimedDeepFit) {
  const [profile, product] = await Promise.all([
    db.bodyProfile.findUnique({
      where: { userId: job.userId },
      select: { bodyStatus: true, bodyFitAt: true, bodyFileKey: true },
    }),
    db.product.findUnique({ where: { id: job.productId }, select: FIT_DATA_SELECT }),
  ]);
  if (
    profile?.bodyStatus !== "CONFIRMED" ||
    !profile.bodyFileKey ||
    profile.bodyFitAt?.getTime() !== job.bodyFitAt.getTime()
  )
    return { error: "body changed" as const };
  if (!product?.fitApprovedAt || fitDataHash(product) !== job.fitDataHash)
    return { error: "fit data changed" as const };
  return { profile: { ...profile, bodyFileKey: profile.bodyFileKey }, product };
}

const clamp01 = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;

export async function runDeepFitJob(
  db: PrismaClient,
  storage: Storage,
  run: SimRunner,
  job: ClaimedDeepFit,
): Promise<"done" | "failed" | "retry" | "superseded"> {
  // Still this worker's job: not taken over by another worker after the stale time.
  const mine = { id: job.id, status: "RUNNING" as const, startedAt: job.startedAt };
  const fail = async (error: string, tell: boolean) => {
    const { count } = await db.deepFitJob.updateMany({
      where: mine,
      data: { status: "FAILED", error: error.slice(0, 500) },
    });
    if (!count) return "superseded" as const;
    if (tell)
      await db.notification.createMany({ data: [notice(job, false)], skipDuplicates: true });
    return "failed" as const;
  };

  const current = await stillCurrent(db, job);
  if ("error" in current) return fail(current.error!, false);
  const body = await storage.get(current.profile.bodyFileKey);
  if (!body) return fail("body changed", false);
  const chart = readChart(current.product.sizeChart);

  let out: Awaited<ReturnType<SimRunner>>;
  try {
    out = await run({
      body,
      cls: fitClass(current.product.kind),
      short: isShort(current.product.kind),
      sizes: chart as Record<string, Record<string, number>>,
      fabric: {
        gsm: current.product.gsm,
        stretch_pct: current.product.fabricStretchPct,
        weave: current.product.weave,
      },
      motions: [...DEEP_FIT_MOTIONS],
    });
  } catch (error) {
    if (job.attempts >= MAX_ATTEMPTS) return fail(String(error), true);
    const { count } = await db.deepFitJob.updateMany({
      where: mine,
      data: { status: "QUEUED", error: String(error).slice(0, 500) },
    });
    return count ? "retry" : "superseded";
  }

  if (!(await db.deepFitJob.count({ where: mine }))) return "superseded";
  if (out.result.status !== "ok") return fail("simulation failed", true);

  const result: DeepFitResult = { sizes: {}, seconds: Number(out.result.seconds) || 0 };
  const stored: string[] = [];
  for (const [size, s] of Object.entries(out.result.sizes ?? {})) {
    if (!chart[size] || !isSizeName(size)) continue;
    const tension = Object.fromEntries(
      Object.entries(s.tension ?? {}).flatMap(([k, v]) => {
        const t = clamp01(v);
        return t === null ? [] : [[k, t]];
      }),
    );
    const bytes = out.garments[size];
    const key = bytes ? garmentKey(job.userId, job.id, size) : null;
    if (key) {
      await storage.put(key, bytes!);
      stored.push(key);
    }
    result.sizes[size] = { tension, garmentKey: key, ...(s.note ? { note: String(s.note) } : {}) };
  }
  if (!Object.keys(result.sizes).length) return fail("simulation returned no sizes", true);

  const outcome = await db.$transaction(async (tx) => {
    // The buyer may have rebuilt their body (or the factory changed the chart) while it ran.
    const now = await stillCurrent(tx, job);
    if ("error" in now) {
      const { count } = await tx.deepFitJob.updateMany({
        where: mine,
        data: { status: "FAILED", error: now.error },
      });
      return count ? ("discarded" as const) : ("superseded" as const);
    }
    const { count } = await tx.deepFitJob.updateMany({
      where: mine,
      data: { status: "DONE", error: null, result: result as unknown as Prisma.InputJsonValue },
    });
    if (!count) return "superseded" as const; // the other worker's files have the same keys
    await tx.notification.createMany({ data: [notice(job, true)], skipDuplicates: true });
    return "done" as const;
  });
  // Discarded, or the job was deleted with the buyer's body while it ran: its files go too.
  if (
    outcome === "discarded" ||
    (outcome === "superseded" && !(await db.deepFitJob.count({ where: { id: job.id } })))
  )
    await Promise.all(stored.map((k) => storage.delete(k)));
  return outcome === "discarded" ? "failed" : outcome;
}

/** Garment files of the given jobs, from their stored results. */
function garmentKeys(jobs: { result: Prisma.JsonValue | null }[]) {
  return jobs.flatMap((j) =>
    Object.values((j.result as DeepFitResult | null)?.sizes ?? {}).flatMap((s) =>
      s.garmentKey ? [s.garmentKey] : [],
    ),
  );
}

/** Removes every Deep Fit Test of a buyer and its files (the buyer deleted their 3D body). */
export async function deleteDeepFits(db: PrismaClient, storage: Storage, userId: string) {
  const jobs = await db.deepFitJob.findMany({ where: { userId }, select: { result: true } });
  await db.deepFitJob.deleteMany({ where: { userId } });
  await Promise.all(garmentKeys(jobs).map((k) => storage.delete(k)));
}

/** Sweep: finished tests' files and rows go 90 days after creation. */
export async function sweepDeepFits(db: PrismaClient, storage: Storage, now = new Date()) {
  const where = {
    status: { in: ["DONE" as const, "FAILED" as const] },
    createdAt: { lt: new Date(now.getTime() - DEEP_FIT_KEEP_MS) },
  };
  const jobs = await db.deepFitJob.findMany({ where, select: { id: true, result: true } });
  if (!jobs.length) return 0;
  await Promise.all(garmentKeys(jobs).map((k) => storage.delete(k)));
  const { count } = await db.deepFitJob.deleteMany({
    where: { id: { in: jobs.map((j) => j.id) } },
  });
  return count;
}
