import { afterAll, beforeEach, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { bodyFileFor, confirmBody, deleteBody, getBodyModel, rebuildBody } from "@/server/body-fit";
import {
  claimBodyFit,
  exportBodyCase,
  MAX_ATTEMPTS,
  OUTLINE_KEEP_MS,
  runBodyFitJob,
  STALE_MS,
  sweepBodyOutlines,
  upgradeBodies,
  type FitRunner,
} from "@/server/body-fit-jobs";
import { db } from "@/server/db";
import {
  deleteBodyProfile,
  getFitView,
  saveBodyProfile,
  saveFitData,
  setFitApproved,
} from "@/server/fit";
import { storage } from "@/server/storage";
import { makeBuyer, makeFactory, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const outline = {
  width: 16,
  height: 64,
  spans: [[10, 4, 11]],
  landmarks: Array.from({ length: 33 }, () => [8, 10, 1]),
};
const profile = (extra: object = {}) => ({
  heightCm: 172,
  gender: "MEN",
  ageBand: null,
  measurements: { waist: { value: 84, low: 83, high: 85, source: "typed" } },
  captureMeta: null,
  consent: true,
  outlines: { front: outline, side: null },
  ...extra,
});
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
const ok: FitRunner = async () => ({
  result: {
    status: "ok",
    quality: { rmsCm: 0.4, pass: true, reasons: [] },
    phenotype: { gender: 0 },
    local: {},
    measurements: { height: 172, chest: 98, waist: 84, hip: 96 },
  },
  glb: GLB,
});

async function buildOnce(run: FitRunner = ok) {
  const job = await claimBodyFit(db);
  expect(job).not.toBeNull();
  return runBodyFitJob(db, storage(), run, job!);
}

it("new photos queue one build from outlines, with typed tape values and Anny's gender", async () => {
  const buyer = await makeBuyer();
  await saveBodyProfile(buyer.id, profile());
  await saveBodyProfile(buyer.id, profile());
  const jobs = await db.bodyFitJob.findMany({ where: { userId: buyer.id } });
  expect(jobs).toHaveLength(1); // the waiting build is replaced
  expect(jobs[0].input).toMatchObject({ heightCm: 172, gender: 0, typed: { waist: 84 } });
  expect((await getBodyModel(buyer.id))?.status).toBe("BUILDING");

  // Without new outlines the 3D body is left as it is.
  const other = await makeBuyer();
  await saveBodyProfile(other.id, profile({ outlines: null }));
  expect(await getBodyModel(other.id)).toBeNull();
});

it("a build moves to the check, serves the file only to its owner, and confirming clears outlines", async () => {
  const buyer = await makeBuyer();
  const other = await makeBuyer();
  await saveBodyProfile(buyer.id, profile());
  expect(await buildOnce()).toBe("check");
  expect(await claimBodyFit(db)).toBeNull();

  const body = await getBodyModel(buyer.id);
  expect(body).toMatchObject({ status: "CHECK", canAdjust: true, measurements: { chest: 98 } });
  expect(await bodyFileFor(buyer.id)).toEqual(Buffer.from(GLB));
  expect(await bodyFileFor(other.id)).toBeNull();
  expect(await db.notification.count({ where: { userId: buyer.id } })).toBe(1);

  await confirmBody(buyer.id);
  expect(await getBodyModel(buyer.id)).toMatchObject({ status: "CONFIRMED", canAdjust: false });
  expect(
    await db.bodyFitJob.count({ where: { userId: buyer.id, input: { not: Prisma.DbNull } } }),
  ).toBe(0);
  await expect(confirmBody(buyer.id)).rejects.toThrow("not waiting");
});

it("rebuilding uses the kept outlines with the buyer's chest, waist and hip", async () => {
  const buyer = await makeBuyer();
  await saveBodyProfile(buyer.id, profile());
  await buildOnce();
  await rebuildBody(buyer.id, { chest: "101", hip: "99" });
  const latest = await db.bodyFitJob.findFirst({
    where: { userId: buyer.id },
    orderBy: { createdAt: "desc" },
  });
  expect(latest?.input).toMatchObject({ typed: { chest: 101, waist: 84, hip: 99 } });
  expect((await getBodyModel(buyer.id))?.status).toBe("BUILDING");
  await expect(rebuildBody(buyer.id, { chest: "500" })).rejects.toThrow();
});

it("a crashing fitter is retried, then the build fails; a failed fit fails at once", async () => {
  const buyer = await makeBuyer();
  await saveBodyProfile(buyer.id, profile());
  const crash: FitRunner = async () => {
    throw new Error("python missing");
  };
  for (let i = 1; i < MAX_ATTEMPTS; i++) expect(await buildOnce(crash)).toBe("retry");
  expect(await buildOnce(crash)).toBe("failed");
  expect((await getBodyModel(buyer.id))?.status).toBe("FAILED");

  const second = await makeBuyer();
  await saveBodyProfile(second.id, profile());
  const bad: FitRunner = async () => ({
    result: {
      ...(await ok(null)).result,
      status: "failed",
      quality: { rmsCm: 3, pass: false, reasons: ["outline_mismatch"] },
    },
    glb: null,
  });
  expect(await buildOnce(bad)).toBe("failed");
  expect((await getBodyModel(second.id))?.status).toBe("FAILED");
  expect(await bodyFileFor(second.id)).toBeNull();
});

it("a build finished after newer photos were sent does not replace the newer build", async () => {
  const buyer = await makeBuyer();
  await saveBodyProfile(buyer.id, profile());
  const job = await claimBodyFit(db);
  await new Promise((r) => setTimeout(r, 5));
  await saveBodyProfile(buyer.id, profile());
  expect(await runBodyFitJob(db, storage(), ok, job!)).toBe("check");
  expect((await getBodyModel(buyer.id))?.status).toBe("BUILDING");
});

it("outlines are swept after 7 days and deleting removes the 3D body", async () => {
  const buyer = await makeBuyer();
  await saveBodyProfile(buyer.id, profile());
  await buildOnce();
  expect(await sweepBodyOutlines(db, new Date(Date.now() + OUTLINE_KEEP_MS + 1000))).toBe(1);
  expect((await getBodyModel(buyer.id))?.canAdjust).toBe(false);

  await deleteBody(buyer.id);
  expect(await getBodyModel(buyer.id)).toBeNull();
  expect(await db.bodyFitJob.count()).toBe(0);

  await saveBodyProfile(buyer.id, profile());
  await buildOnce();
  await deleteBodyProfile(buyer.id);
  expect(await db.bodyProfile.count()).toBe(0);
});

it("the product page draws the garment on the buyer's body only once they confirm it", async () => {
  const { factory, variant } = await makeFactory();
  const admin = await makeUser("ADMIN", "FACTORY");
  await saveFitData(
    variant.productId,
    {
      chart: { M: { chest: 102, waist: 98 } },
      fabricStretchPct: 5,
      gsm: null,
      weave: null,
      thermalMinC: null,
      thermalMaxC: null,
      breathability: null,
      careNotes: null,
    },
    { sellerId: factory.id },
  );
  await setFitApproved(admin.id, variant.productId, true);
  const buyer = await makeBuyer();
  await saveBodyProfile(buyer.id, profile());
  await buildOnce();
  expect((await getFitView(variant.productId, buyer.id)).body).toBeNull();
  await confirmBody(buyer.id);
  const view = await getFitView(variant.productId, buyer.id);
  expect(view.body).toMatchObject({ fitClass: "top", short: false, own: true });
  expect(view.body?.url).toMatch(/^\/api\/fit-body\?v=/);
  // A body built before the skeleton stands still.
  expect(view.body?.animated).toBe(false);
  await saveBodyProfile(buyer.id, profile());
  await buildOnce(async (input) => {
    const out = await ok(input);
    return { ...out, result: { ...out.result, bodyVersion: 2 } };
  });
  await confirmBody(buyer.id);
  expect((await getFitView(variant.productId, buyer.id)).body?.animated).toBe(true);
});

it("a body built before the skeleton is rewritten from its stored shape, still confirmed", async () => {
  const buyer = await makeBuyer();
  await saveBodyProfile(buyer.id, profile());
  await buildOnce();
  await confirmBody(buyer.id);
  const before = await db.bodyProfile.findUniqueOrThrow({ where: { userId: buyer.id } });
  const NEW = new Uint8Array([1, 2, 3]);
  const seen: unknown[] = [];
  const write = async (params: unknown) => (seen.push(params), NEW);

  expect(await upgradeBodies(db, storage(), write)).toBe(1);
  const after = await db.bodyProfile.findUniqueOrThrow({ where: { userId: buyer.id } });
  expect(seen).toEqual([{ phenotype: { gender: 0 }, local: {} }]);
  expect(after.bodyStatus).toBe("CONFIRMED");
  expect(after.bodyFitAt).toEqual(before.bodyFitAt);
  expect(after.bodyFileKey).not.toBe(before.bodyFileKey);
  expect((after.bodyFit as { bodyVersion: number }).bodyVersion).toBe(2);
  expect([...(await storage().get(after.bodyFileKey!))!]).toEqual([1, 2, 3]);
  expect(await storage().get(before.bodyFileKey!)).toBeNull();
  expect(await db.notification.count({ where: { userId: buyer.id } })).toBe(1); // the build's only
  // Nothing left to do.
  expect(await upgradeBodies(db, storage(), write)).toBe(0);
});

it("a volunteer's capture is exported for the accuracy test until its outlines are cleared", async () => {
  const buyer = await makeBuyer();
  await saveBodyProfile(buyer.id, profile());
  const tape = { chest: 97, waist: 83.5, hip: 95 };
  const exported = await exportBodyCase(db, buyer.email, tape);
  expect(exported.job).toMatchObject({ heightCm: 172, front: { width: 16 } });
  expect(exported.tape).toEqual(tape);
  await expect(exportBodyCase(db, "nobody@example.com", tape)).rejects.toThrow("No such user");

  await buildOnce();
  await confirmBody(buyer.id);
  await expect(exportBodyCase(db, buyer.email, tape)).rejects.toThrow("No outlines stored");
});

it("with the 3D body switched off, photos save measurements and queue no build", async () => {
  process.env.BODY_FIT_ENABLED = "";
  try {
    const buyer = await makeBuyer();
    const saved = await saveBodyProfile(buyer.id, profile());
    expect(saved.heightCm).toBe(172);
    expect(await db.bodyFitJob.count({ where: { userId: buyer.id } })).toBe(0);
    expect(await getBodyModel(buyer.id)).toBeNull();
  } finally {
    process.env.BODY_FIT_ENABLED = "1";
  }
});

it("a worker that lost its job to another worker does not write its late result", async () => {
  const buyer = await makeBuyer();
  await saveBodyProfile(buyer.id, profile());
  const first = (await claimBodyFit(db))!;
  // The first worker hangs; after the stale time a second worker takes the same job.
  const second = (await claimBodyFit(db, new Date(Date.now() + STALE_MS + 1000)))!;
  expect(second.id).toBe(first.id);

  expect(await runBodyFitJob(db, storage(), ok, first)).toBe("superseded");
  expect((await getBodyModel(buyer.id))?.status).toBe("BUILDING");
  expect(await db.notification.count({ where: { userId: buyer.id } })).toBe(0);
  expect(await storage().get(`bodies/${buyer.id}/${first.id}.glb`)).toBeNull();

  expect(await runBodyFitJob(db, storage(), ok, second)).toBe("check");
  expect((await getBodyModel(buyer.id))?.status).toBe("CHECK");
});

it("a build finishing after the buyer saved new photos leaves the new build in charge", async () => {
  const buyer = await makeBuyer();
  await saveBodyProfile(buyer.id, profile());
  const old = (await claimBodyFit(db))!;
  await saveBodyProfile(buyer.id, profile());
  await runBodyFitJob(db, storage(), ok, old);
  expect((await getBodyModel(buyer.id))?.status).toBe("BUILDING");
  expect(await storage().get(`bodies/${buyer.id}/${old.id}.glb`)).toBeNull();
  expect(await db.notification.count({ where: { userId: buyer.id } })).toBe(0);
});
