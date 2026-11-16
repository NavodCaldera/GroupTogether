/**
 * The buyer's own 3D body (DEC-021): the job queue the fit worker (`npm run fit:worker`) works
 * through. No "server-only" import, so the command-line worker can use it with its own client.
 *
 * A job holds the phone's outlines and joints (never photos). The worker fits an Anny body
 * (tools/body-fitting), stores the body file privately and moves the profile to CHECK, where the
 * buyer confirms it; confirming clears every outline. Outlines older than 7 days are swept.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import type { Storage } from "./storage/local";

export const MAX_ATTEMPTS = 3;
/** A RUNNING job not finished in this time belongs to a crashed worker and is taken again. */
export const STALE_MS = 10 * 60 * 1000;
export const OUTLINE_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

export interface FitResult {
  status: "ok" | "failed";
  quality: { rmsCm: number; pass: boolean; reasons: string[] } & Record<string, unknown>;
  phenotype: Record<string, number>;
  local: Record<string, number>;
  measurements: Record<string, number>;
  /** 2 and up: the body file has a skeleton and can be shown moving. */
  bodyVersion?: number;
}

/** The body file's current format: 2 has a skeleton (tools/body-fitting/fit.py `BODY_VERSION`). */
export const BODY_VERSION = 2;

/** Writes the body file again from stored Anny parameters, without fitting. */
export type BodyWriter = (params: {
  phenotype: Record<string, number>;
  local: Record<string, number>;
}) => Promise<Uint8Array>;

/** Runs the Python fitter on one job input; the glb is null when the fit failed. */
export type FitRunner = (input: unknown) => Promise<{ result: FitResult; glb: Uint8Array | null }>;

export interface ClaimedJob {
  id: string;
  userId: string;
  input: unknown;
  attempts: number;
  createdAt: Date;
}

/** Takes the oldest queued (or stale running) job; safe with several workers. */
export async function claimBodyFit(db: PrismaClient, now = new Date()): Promise<ClaimedJob | null> {
  const stale = new Date(now.getTime() - STALE_MS);
  const rows = await db.$queryRaw<ClaimedJob[]>`
    UPDATE "BodyFitJob" SET status = 'RUNNING', attempts = attempts + 1, "startedAt" = ${now},
      "updatedAt" = ${now}
    WHERE id = (
      SELECT id FROM "BodyFitJob"
      WHERE input IS NOT NULL
        AND (status = 'QUEUED' OR (status = 'RUNNING' AND "startedAt" < ${stale}))
      ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id, "userId", input, attempts, "createdAt"`;
  return rows[0] ?? null;
}

/** True when no newer build was queued for this buyer while this one ran. */
async function isLatest(db: PrismaClient, job: ClaimedJob) {
  return !(await db.bodyFitJob.count({
    where: { userId: job.userId, createdAt: { gt: job.createdAt } },
  }));
}

const notice = (jobId: string, ok: boolean) => ({
  id: `body-fit:${jobId}`,
  title: ok ? "Your 3D body is ready" : "We couldn't build your 3D body",
  body: ok ? "Check it looks like you." : "Retake your photos to try again.",
  href: "/account/fit",
});

export async function runBodyFitJob(
  db: PrismaClient,
  storage: Storage,
  run: FitRunner,
  job: ClaimedJob,
): Promise<"check" | "failed" | "retry"> {
  let out: Awaited<ReturnType<FitRunner>>;
  try {
    out = await run(job.input);
  } catch (error) {
    const last = job.attempts >= MAX_ATTEMPTS;
    await db.bodyFitJob.update({
      where: { id: job.id },
      data: { status: last ? "FAILED" : "QUEUED", error: String(error).slice(0, 500) },
    });
    if (!last) return "retry";
    if (await isLatest(db, job)) {
      await db.bodyProfile.updateMany({
        where: { userId: job.userId },
        data: { bodyStatus: "FAILED" },
      });
      await db.notification.createMany({
        data: [{ userId: job.userId, ...notice(job.id, false) }],
        skipDuplicates: true,
      });
    }
    return "failed";
  }

  const ok = out.result.status === "ok" && !!out.glb;
  const latest = await isLatest(db, job);
  const key = ok ? `bodies/${job.userId}/${job.id}.glb` : null;
  if (key && latest) await storage.put(key, out.glb!);
  const old = latest
    ? await db.bodyProfile.findUnique({
        where: { userId: job.userId },
        select: { bodyFileKey: true },
      })
    : null;
  await db.$transaction(async (tx) => {
    await tx.bodyFitJob.update({
      where: { id: job.id },
      data: {
        status: ok ? "DONE" : "FAILED",
        error: ok ? null : out.result.quality.reasons.join(","),
      },
    });
    if (!latest) return;
    await tx.bodyProfile.updateMany({
      where: { userId: job.userId },
      data: ok
        ? {
            bodyStatus: "CHECK",
            bodyFileKey: key,
            bodyFit: {
              quality: out.result.quality,
              measurements: out.result.measurements,
              phenotype: out.result.phenotype,
              local: out.result.local,
              bodyVersion: out.result.bodyVersion ?? 1,
            } as Prisma.InputJsonValue,
            bodyFitAt: new Date(),
          }
        : { bodyStatus: "FAILED" },
    });
    await tx.notification.createMany({
      data: [{ userId: job.userId, ...notice(job.id, ok) }],
      skipDuplicates: true,
    });
  });
  if (ok && latest && old?.bodyFileKey && old.bodyFileKey !== key)
    await storage.delete(old.bodyFileKey);
  return ok ? "check" : "failed";
}

/** Clears outlines kept longer than 7 days (the buyer never confirmed). */
export async function sweepBodyOutlines(db: PrismaClient, now = new Date()) {
  const { count } = await db.bodyFitJob.updateMany({
    where: {
      input: { not: Prisma.DbNull },
      createdAt: { lt: new Date(now.getTime() - OUTLINE_KEEP_MS) },
    },
    data: { input: Prisma.DbNull },
  });
  return count;
}

/**
 * Brings body files in an older format up to date from their stored shape. The buyer's check and
 * confirmation stand: status and fit time are unchanged and nobody is notified.
 */
export async function upgradeBodies(
  db: PrismaClient,
  storage: Storage,
  write: BodyWriter,
  limit = 20,
): Promise<number> {
  const rows = await db.$queryRaw<{ userId: string; bodyFileKey: string; bodyFit: unknown }[]>`
    SELECT "userId", "bodyFileKey", "bodyFit" FROM "BodyProfile"
    WHERE "bodyFileKey" IS NOT NULL AND "bodyFit" ? 'phenotype'
      AND COALESCE(("bodyFit"->>'bodyVersion')::int, 1) < ${BODY_VERSION}
    ORDER BY "bodyFitAt" LIMIT ${limit}`;
  let done = 0;
  for (const row of rows) {
    const fit = row.bodyFit as Parameters<BodyWriter>[0] & Record<string, unknown>;
    const key = row.bodyFileKey.replace(/(-v\d+)?\.glb$/, `-v${BODY_VERSION}.glb`);
    await storage.put(key, await write({ phenotype: fit.phenotype, local: fit.local ?? {} }));
    // Only if the buyer has not rebuilt or deleted the body meanwhile.
    const { count } = await db.bodyProfile.updateMany({
      where: { userId: row.userId, bodyFileKey: row.bodyFileKey },
      data: {
        bodyFileKey: key,
        bodyFit: { ...fit, bodyVersion: BODY_VERSION } as Prisma.InputJsonValue,
      },
    });
    await storage.delete(count ? row.bodyFileKey : key);
    done += count;
  }
  return done;
}
