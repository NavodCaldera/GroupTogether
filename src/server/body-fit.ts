import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { deleteDeepFits } from "./deep-fit-jobs";
import { AppError } from "./errors";
import { storage } from "./storage";

/**
 * The buyer's own 3D body (DEC-021): queueing a build from the phone's outlines, the
 * confirmation step and removal. The worker side is in `body-fit-jobs.ts`.
 */

/**
 * The buyer's own 3D body is built only when BODY_FIT_ENABLED is "1". Keep it off in production
 * until the accuracy test on real people passes (tools/body-fitting/README.md). Bodies already
 * built still show.
 */
export const bodyFitEnabled = () => process.env.BODY_FIT_ENABLED === "1";

export class BodyFitError extends AppError {}

const outline = z.object({
  width: z.number().int().min(16).max(1024),
  height: z.number().int().min(64).max(1024),
  spans: z
    .array(z.tuple([z.number().int().min(0), z.number().int().min(0), z.number().int().min(0)]))
    .max(12000),
  landmarks: z.array(z.tuple([z.number(), z.number(), z.number().min(0).max(1)])).length(33),
});

export const outlinesSchema = z.object({ front: outline, side: outline.nullable() });
export type Outlines = z.infer<typeof outlinesSchema>;

const ANNY_GENDER: Record<string, number> = { MEN: 0, WOMEN: 1 };
const GIRTHS = ["chest", "waist", "hip"] as const;
type Girth = (typeof GIRTHS)[number];

interface JobInput {
  heightCm: number;
  gender?: number;
  typed: Partial<Record<Girth, number>>;
  front: Outlines["front"];
  side: Outlines["side"];
}

type Stored = Record<string, { value: number; source?: string }>;

/** Typed tape measurements the fit should honour. */
function typedGirths(measurements: unknown): JobInput["typed"] {
  const m = (measurements ?? {}) as Stored;
  return Object.fromEntries(
    GIRTHS.flatMap((k) => (m[k]?.source === "typed" ? [[k, m[k].value]] : [])),
  );
}

async function queue(tx: Prisma.TransactionClient, userId: string, input: JobInput) {
  // Only the newest build matters: drop builds still waiting.
  await tx.bodyFitJob.deleteMany({ where: { userId, status: "QUEUED" } });
  await tx.bodyFitJob.create({
    data: { userId, input: input as unknown as Prisma.InputJsonValue },
  });
  await tx.bodyProfile.update({ where: { userId }, data: { bodyStatus: "BUILDING" } });
}

/** Called after the profile is saved with new photos' outlines. */
export async function queueBodyFit(
  tx: Prisma.TransactionClient,
  userId: string,
  profile: { heightCm: number; gender: string | null; measurements: unknown },
  outlines: Outlines,
) {
  if (profile.heightCm < 120 || profile.heightCm > 220)
    throw new BodyFitError("Height must be between 120 and 220 cm for a 3D body");
  await queue(tx, userId, {
    heightCm: profile.heightCm,
    ...(profile.gender && profile.gender in ANNY_GENDER
      ? { gender: ANNY_GENDER[profile.gender] }
      : {}),
    typed: typedGirths(profile.measurements),
    front: outlines.front,
    side: outlines.side,
  });
}

export interface BodyModel {
  status: "BUILDING" | "CHECK" | "CONFIRMED" | "FAILED";
  measurements: Partial<Record<Girth | "height", number>>;
  /** The outlines are still kept, so the body can be rebuilt without new photos. */
  canAdjust: boolean;
  version: string;
}

export async function getBodyModel(userId: string): Promise<BodyModel | null> {
  const p = await db.bodyProfile.findUnique({
    where: { userId },
    select: { bodyStatus: true, bodyFit: true, bodyFitAt: true },
  });
  if (!p?.bodyStatus) return null;
  const latest = await db.bodyFitJob.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { input: true },
  });
  const fit = (p.bodyFit ?? {}) as { measurements?: Record<string, number> };
  return {
    status: p.bodyStatus,
    measurements: fit.measurements ?? {},
    canAdjust: latest?.input != null,
    version: p.bodyFitAt?.getTime().toString(36) ?? "0",
  };
}

const adjustSchema = z.object(
  Object.fromEntries(
    GIRTHS.map((k) => [k, z.coerce.number().min(40).max(200).optional()]),
  ) as Record<Girth, z.ZodOptional<z.ZodCoercedNumber>>,
);

/** Rebuilds from the kept outlines with the buyer's chest, waist and hip as tape values. */
export async function rebuildBody(userId: string, input: unknown) {
  const adjust = adjustSchema.parse(input);
  await db.$transaction(async (tx) => {
    const p = await tx.bodyProfile.findUnique({ where: { userId }, select: { bodyStatus: true } });
    if (p?.bodyStatus !== "CHECK" && p?.bodyStatus !== "FAILED")
      throw new BodyFitError("Your 3D body is not waiting for a check");
    const latest = await tx.bodyFitJob.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { input: true },
    });
    if (!latest?.input) throw new BodyFitError("Retake your photos to rebuild your 3D body");
    const prev = latest.input as unknown as JobInput;
    const typed = { ...prev.typed };
    for (const k of GIRTHS) if (adjust[k] !== undefined) typed[k] = adjust[k];
    await queue(tx, userId, { ...prev, typed });
  });
}

/** The buyer says the body looks like them: it replaces the archetype and the outlines go. */
export async function confirmBody(userId: string) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.bodyProfile.updateMany({
      where: { userId, bodyStatus: "CHECK" },
      data: { bodyStatus: "CONFIRMED" },
    });
    if (!count) throw new BodyFitError("Your 3D body is not waiting for a check");
    await tx.bodyFitJob.updateMany({ where: { userId }, data: { input: Prisma.DbNull } });
  });
}

/** Removes the 3D body, its file, every outline and its Deep Fit Tests; the measurements stay. */
export async function deleteBody(userId: string) {
  const p = await db.bodyProfile.findUnique({ where: { userId }, select: { bodyFileKey: true } });
  await db.$transaction([
    db.bodyFitJob.deleteMany({ where: { userId } }),
    db.bodyProfile.updateMany({
      where: { userId },
      data: { bodyStatus: null, bodyFileKey: null, bodyFit: Prisma.DbNull, bodyFitAt: null },
    }),
  ]);
  if (p?.bodyFileKey) await storage().delete(p.bodyFileKey);
  await deleteDeepFits(db, storage(), userId);
}

/** The owner's body file, for `/api/fit-body` only. */
export async function bodyFileFor(userId: string) {
  const p = await db.bodyProfile.findUnique({
    where: { userId },
    select: { bodyStatus: true, bodyFileKey: true },
  });
  if (!p?.bodyFileKey || (p.bodyStatus !== "CHECK" && p.bodyStatus !== "CONFIRMED")) return null;
  return storage().get(p.bodyFileKey);
}
