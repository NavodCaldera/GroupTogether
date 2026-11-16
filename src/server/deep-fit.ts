import "server-only";
import { readChart } from "@/lib/fit/data";
import { db } from "./db";
import {
  DEEP_FIT_PER_DAY,
  DEEP_FIT_WINDOW_MS,
  FIT_DATA_SELECT,
  fitDataHash,
  type DeepFitResult,
} from "./deep-fit-jobs";
import { AppError } from "./errors";
import { storage } from "./storage";

/**
 * Deep Fit Test (DEC-021): the buyer asks for one garment to be cloth-simulated on their own
 * confirmed body, at most 5 a day. The worker side is in `deep-fit-jobs.ts`.
 */

export class DeepFitError extends AppError {}

export type DeepFitStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED";

/** The buyer's current body and the product's approved fit data, or null. */
async function basis(userId: string, productId: string) {
  const [profile, product] = await Promise.all([
    db.bodyProfile.findUnique({
      where: { userId },
      select: { bodyStatus: true, bodyFitAt: true },
    }),
    db.product.findUnique({ where: { id: productId }, select: FIT_DATA_SELECT }),
  ]);
  const body = profile?.bodyStatus === "CONFIRMED" && profile.bodyFitAt ? profile.bodyFitAt : null;
  const fitData =
    product?.fitApprovedAt && Object.keys(readChart(product.sizeChart)).length
      ? fitDataHash(product)
      : null;
  return { bodyFitAt: body, fitDataHash: fitData };
}

const since = (now: Date) => new Date(now.getTime() - DEEP_FIT_WINDOW_MS);

/** Tests the buyer can still ask for in the last 24 hours. */
export async function deepFitsLeft(userId: string, now = new Date()) {
  const used = await db.deepFitJob.count({ where: { userId, createdAt: { gte: since(now) } } });
  return Math.max(0, DEEP_FIT_PER_DAY - used);
}

/**
 * Queues a Deep Fit Test, or returns the one already queued, running or done for this body and
 * fit data (that does not count against the 5 a day).
 */
export async function requestDeepFit(
  userId: string,
  productId: string,
): Promise<{ jobId: string }> {
  const { bodyFitAt, fitDataHash } = await basis(userId, productId);
  if (!bodyFitAt) throw new DeepFitError("Confirm your 3D body first");
  if (!fitDataHash) throw new DeepFitError("This product has no approved size chart");
  return db.$transaction(async (tx) => {
    // One request at a time per buyer, so two at once cannot both pass the daily limit.
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`deep-fit:${userId}`}))) AS l`;
    const existing = await tx.deepFitJob.findFirst({
      where: {
        userId,
        productId,
        bodyFitAt,
        fitDataHash,
        status: { in: ["QUEUED", "RUNNING", "DONE"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (existing) return { jobId: existing.id };
    const now = new Date();
    const used = await tx.deepFitJob.count({ where: { userId, createdAt: { gte: since(now) } } });
    if (used >= DEEP_FIT_PER_DAY) throw new DeepFitError("You've used today's 5 tests");
    const job = await tx.deepFitJob.create({
      data: { userId, productId, bodyFitAt, fitDataHash },
      select: { id: true },
    });
    return { jobId: job.id };
  });
}

export interface DeepFit {
  status: DeepFitStatus;
  /** Per size, tension 0 to 1 per area; empty until DONE. */
  tensions: Record<string, Record<string, number>>;
  /** Per size, the buyer's own simulated garment file; empty until DONE. */
  garments: Record<string, string>;
}

/** The newest test of this garment on the buyer's current body and fit data, or null. */
export async function getDeepFit(userId: string, productId: string): Promise<DeepFit | null> {
  const { bodyFitAt, fitDataHash } = await basis(userId, productId);
  if (!bodyFitAt || !fitDataHash) return null;
  const job = await db.deepFitJob.findFirst({
    where: { userId, productId, bodyFitAt, fitDataHash },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, result: true },
  });
  if (!job) return null;
  const tensions: DeepFit["tensions"] = {};
  const garments: DeepFit["garments"] = {};
  const result = job.status === "DONE" ? (job.result as DeepFitResult | null) : null;
  for (const [size, s] of Object.entries(result?.sizes ?? {})) {
    tensions[size] = s.tension;
    if (s.garmentKey)
      garments[size] = `/api/fit-garment?job=${job.id}&size=${encodeURIComponent(size)}`;
  }
  return { status: job.status, tensions, garments };
}

/** The owner's simulated garment, for `/api/fit-garment` only. */
export async function deepFitGarmentFor(userId: string, jobId: string, size: string) {
  const job = await db.deepFitJob.findFirst({
    where: { id: jobId, userId, status: "DONE" },
    select: { result: true },
  });
  const sizes = (job?.result as DeepFitResult | null)?.sizes ?? {};
  const key = Object.hasOwn(sizes, size) ? sizes[size].garmentKey : null;
  return key ? storage().get(key) : null;
}
