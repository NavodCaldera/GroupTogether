import { afterAll, beforeEach, expect, it, vi } from "vitest";
const principal = vi.hoisted(() => ({
  user: null as null | { id: string; role: string; adminArea?: string | null; locked?: boolean },
}));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => principal.user }));
import { GET } from "@/app/api/fit-garment/route";
import { confirmBody, deleteBody } from "@/server/body-fit";
import { claimBodyFit, runBodyFitJob, type FitRunner } from "@/server/body-fit-jobs";
import { db } from "@/server/db";
import { deepFitsLeft, getDeepFit, requestDeepFit } from "@/server/deep-fit";
import {
  claimDeepFit,
  DEEP_FIT_KEEP_MS,
  DEEP_FIT_STALE_MS,
  garmentKey,
  MAX_ATTEMPTS,
  runDeepFitJob,
  type SimInput,
  type SimRunner,
} from "@/server/deep-fit-jobs";
import { getFitView, saveBodyProfile, saveFitData, setFitApproved } from "@/server/fit";
import { storage } from "@/server/storage";
import { runSweep } from "@/server/sweep";
import { makeBuyer, makeFactory, makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  principal.user = null;
  await resetDb();
});
afterAll(() => db.$disconnect());

const outline = {
  width: 16,
  height: 64,
  spans: [[10, 4, 11]],
  landmarks: Array.from({ length: 33 }, () => [8, 10, 1]),
};
const profile = {
  heightCm: 172,
  gender: "MEN",
  ageBand: null,
  measurements: { waist: { value: 84, low: 83, high: 85, source: "typed" } },
  captureMeta: null,
  consent: true,
  outlines: { front: outline, side: null },
};
const BODY = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
const fitOk: FitRunner = async () => ({
  result: {
    status: "ok",
    quality: { rmsCm: 0.4, pass: true, reasons: [] },
    phenotype: { gender: 0 },
    local: {},
    measurements: { height: 172, chest: 98, waist: 84, hip: 96 },
  },
  glb: BODY,
});

/** A buyer with a confirmed 3D body. */
async function confirmedBuyer() {
  const buyer = await makeBuyer();
  await rebuild(buyer.id);
  await confirmBody(buyer.id);
  return buyer;
}

/** New photos, built to the check step. */
async function rebuild(userId: string) {
  await saveBodyProfile(userId, profile);
  const job = await claimBodyFit(db);
  expect(await runBodyFitJob(db, storage(), fitOk, job!)).toBe("check");
}

/** A product with an approved size chart. */
async function fittedProduct() {
  const { factory, variant } = await makeFactory();
  const admin = await makeUser("ADMIN", "FACTORY");
  await saveFitData(
    variant.productId,
    {
      chart: { S: { chest: 96, waist: 90 }, M: { chest: 102, waist: 98 } },
      fabricStretchPct: 5,
      gsm: 180,
      weave: "knit",
      thermalMinC: null,
      thermalMaxC: null,
      breathability: null,
      careNotes: null,
    },
    { sellerId: factory.id },
  );
  await setFitApproved(admin.id, variant.productId, true);
  return variant.productId;
}

const GARMENT = new Uint8Array([1, 2, 3, 4]);
const seen: SimInput[] = [];
const simOk: SimRunner = async (input) => {
  seen.push(input);
  return {
    result: {
      status: "ok",
      seconds: 42,
      sizes: {
        S: { tension: { chest: 0.9, waist: 0.7 }, garment: "S.glb" },
        M: { tension: { chest: 0.31, waist: 0.2 }, garment: "M.glb" },
      },
    },
    garments: { S: GARMENT, M: GARMENT },
  };
};

async function runOnce(run: SimRunner = simOk) {
  const job = await claimDeepFit(db);
  expect(job).not.toBeNull();
  return runDeepFitJob(db, storage(), run, job!);
}

it("a test runs on the buyer's own body and shows its tensions and garments", async () => {
  const buyer = await confirmedBuyer();
  const productId = await fittedProduct();
  expect(await getDeepFit(buyer.id, productId)).toBeNull();
  expect((await getFitView(productId, buyer.id)).deepFit).toEqual({ status: "none", left: 5 });
  const formula = (await getFitView(productId, buyer.id)).report!;
  const { jobId } = await requestDeepFit(buyer.id, productId);
  expect(await getDeepFit(buyer.id, productId)).toMatchObject({ status: "QUEUED" });
  let view = await getFitView(productId, buyer.id);
  expect(view.deepFit).toEqual({ status: "queued", left: 4 });
  expect(view.body?.garments).toBeNull();

  seen.length = 0;
  expect(await runOnce()).toBe("done");
  expect([...seen[0].body]).toEqual([...BODY]);
  expect(seen[0]).toMatchObject({
    cls: "top",
    short: false,
    sizes: { M: { chest: 102, waist: 98 } },
    fabric: { gsm: 180, stretch_pct: 5, weave: "knit" },
    motions: ["WALK", "RUN", "REACH", "SIT"],
  });
  expect(await getDeepFit(buyer.id, productId)).toEqual({
    status: "DONE",
    tensions: { S: { chest: 0.9, waist: 0.7 }, M: { chest: 0.31, waist: 0.2 } },
    garments: {
      S: `/api/fit-garment?job=${jobId}&size=S`,
      M: `/api/fit-garment?job=${jobId}&size=M`,
    },
  });
  expect([...(await storage().get(garmentKey(buyer.id, jobId, "M")))!]).toEqual([1, 2, 3, 4]);
  // The product page draws the buyer's own simulated garments and reports the simulated waist.
  view = await getFitView(productId, buyer.id);
  expect(view.deepFit).toEqual({ status: "done", left: 4 });
  expect(view.body?.garments).toEqual({
    S: `/api/fit-garment?job=${jobId}&size=S`,
    M: `/api/fit-garment?job=${jobId}&size=M`,
  });
  const waist = (r: typeof formula, size: string) =>
    r.sizeOptions.find((o) => o.size === size)?.regions.find((x) => x.region === "waist")?.tension;
  expect(waist(view.report!, "S")).toBe(0.7);
  expect(waist(view.report!, "M")).toBe(0.2);
  expect(waist(formula, "M")).not.toBe(0.2);
  expect(view.report?.simulated).toBe(true);
  const notices = await db.notification.findMany({ where: { userId: buyer.id } });
  expect(notices.find((n) => n.id === `deep-fit:${jobId}`)?.href).toBe(`/products/${productId}`);

  // The owner gets the file; it is never cached.
  principal.user = { id: buyer.id, role: "CUSTOMER" };
  const res = await GET(new Request(`http://localhost/api/fit-garment?job=${jobId}&size=M`));
  expect(res.status).toBe(200);
  expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3, 4]);
});

it("a sixth test within 24 hours is refused; asking again for a tested product does not count", async () => {
  const buyer = await confirmedBuyer();
  const products = [];
  for (let i = 0; i < 6; i++) products.push(await fittedProduct());
  const first = await requestDeepFit(buyer.id, products[0]);
  expect(await requestDeepFit(buyer.id, products[0])).toEqual(first);
  for (let i = 1; i < 5; i++) await requestDeepFit(buyer.id, products[i]);
  expect(await deepFitsLeft(buyer.id)).toBe(0);
  await expect(requestDeepFit(buyer.id, products[5])).rejects.toThrow(
    "You've used today's 5 tests",
  );
  // A product already tested still returns its job, even at the limit.
  expect(await requestDeepFit(buyer.id, products[0])).toEqual(first);
  expect(await db.deepFitJob.count()).toBe(5);

  // Without a confirmed body there is no test.
  const other = await makeBuyer();
  await expect(requestDeepFit(other.id, products[0])).rejects.toThrow("Confirm your 3D body");
});

it("two workers claiming at once get different jobs", async () => {
  const buyer = await confirmedBuyer();
  await requestDeepFit(buyer.id, await fittedProduct());
  await requestDeepFit(buyer.id, await fittedProduct());
  const [a, b] = await Promise.all([claimDeepFit(db), claimDeepFit(db)]);
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(a!.id).not.toBe(b!.id);
  expect(await claimDeepFit(db)).toBeNull();
});

it("a runner that throws three times leaves the job failed and notifies once", async () => {
  const buyer = await confirmedBuyer();
  const productId = await fittedProduct();
  const { jobId } = await requestDeepFit(buyer.id, productId);
  const before = await db.notification.count({ where: { userId: buyer.id } });
  const crash: SimRunner = async () => {
    throw new Error("blender missing");
  };
  for (let i = 1; i < MAX_ATTEMPTS; i++) expect(await runOnce(crash)).toBe("retry");
  expect(await runOnce(crash)).toBe("failed");
  expect(await claimDeepFit(db)).toBeNull();
  const job = await db.deepFitJob.findUniqueOrThrow({ where: { id: jobId } });
  expect(job).toMatchObject({ status: "FAILED", attempts: 3 });
  expect(await db.notification.count({ where: { userId: buyer.id } })).toBe(before + 1);
  expect(await getDeepFit(buyer.id, productId)).toMatchObject({ status: "FAILED", garments: {} });
  // A failed test can be asked for again.
  expect((await requestDeepFit(buyer.id, productId)).jobId).not.toBe(jobId);
});

it("a running test is not taken again within its run time, and fails after its last attempt", async () => {
  const buyer = await confirmedBuyer();
  const { jobId } = await requestDeepFit(buyer.id, await fittedProduct());
  const before = await db.notification.count({ where: { userId: buyer.id } });
  let at = Date.now();
  expect((await claimDeepFit(db, new Date(at)))?.attempts).toBe(1);
  // A Deep Fit Test takes 6 to 30 minutes: another worker leaves it alone.
  expect(await claimDeepFit(db, new Date(at + 30 * 60 * 1000))).toBeNull();
  for (let i = 2; i <= MAX_ATTEMPTS; i++) {
    at += DEEP_FIT_STALE_MS + 1000;
    expect((await claimDeepFit(db, new Date(at)))?.attempts).toBe(i);
  }
  at += DEEP_FIT_STALE_MS + 1000;
  expect(await claimDeepFit(db, new Date(at))).toBeNull();
  const job = await db.deepFitJob.findUniqueOrThrow({ where: { id: jobId } });
  expect(job).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS, error: "timed out" });
  expect(await db.notification.count({ where: { userId: buyer.id } })).toBe(before + 1);
});

it("tests dropped because the body changed don't count against the 5 a day; real failures do", async () => {
  const buyer = await confirmedBuyer();
  const rebuilding: SimRunner = async (input) => {
    await rebuild(buyer.id);
    return simOk(input);
  };
  await requestDeepFit(buyer.id, await fittedProduct());
  expect(await runOnce(rebuilding)).toBe("failed");
  await confirmBody(buyer.id);
  expect(await deepFitsLeft(buyer.id)).toBe(5);

  await requestDeepFit(buyer.id, await fittedProduct());
  const crash: SimRunner = async () => {
    throw new Error("blender missing");
  };
  for (let i = 1; i <= MAX_ATTEMPTS; i++) await runOnce(crash);
  expect(await deepFitsLeft(buyer.id)).toBe(4);
});

it("a product that isn't in the shop can't be tested", async () => {
  const buyer = await confirmedBuyer();
  const hidden = await fittedProduct();
  await db.product.update({ where: { id: hidden }, data: { hiddenAt: new Date() } });
  await expect(requestDeepFit(buyer.id, hidden)).rejects.toThrow("Product not found");
  const soldOut = await fittedProduct();
  await db.variant.updateMany({ where: { productId: soldOut }, data: { available: 0 } });
  await expect(requestDeepFit(buyer.id, soldOut)).rejects.toThrow("Product not found");
  expect(await db.deepFitJob.count()).toBe(0);
});

it("a result finished after the buyer rebuilt their body is discarded", async () => {
  const buyer = await confirmedBuyer();
  const productId = await fittedProduct();
  const { jobId } = await requestDeepFit(buyer.id, productId);
  const rebuilding: SimRunner = async (input) => {
    await rebuild(buyer.id);
    return simOk(input);
  };
  expect(await runOnce(rebuilding)).toBe("failed");
  const job = await db.deepFitJob.findUniqueOrThrow({ where: { id: jobId } });
  expect(job).toMatchObject({ status: "FAILED", error: "body changed", result: null });
  expect(await storage().get(garmentKey(buyer.id, jobId, "M"))).toBeNull();
  expect(await getDeepFit(buyer.id, productId)).toBeNull();
  await confirmBody(buyer.id);
  expect(await getDeepFit(buyer.id, productId)).toBeNull();
});

it("another buyer and a signed-out visitor get 404 for a garment", async () => {
  const buyer = await confirmedBuyer();
  const { jobId } = await requestDeepFit(buyer.id, await fittedProduct());
  await runOnce();
  const url = `http://localhost/api/fit-garment?job=${jobId}&size=M`;

  const signedOut = await GET(new Request(url));
  expect(signedOut.status).toBe(404);
  expect(signedOut.headers.get("Cache-Control")).toBe("private, no-store");

  const other = await confirmedBuyer();
  principal.user = { id: other.id, role: "CUSTOMER" };
  expect((await GET(new Request(url))).status).toBe(404);

  principal.user = { id: buyer.id, role: "CUSTOMER" };
  expect((await GET(new Request(url.replace("size=M", "size=XL")))).status).toBe(404);
  expect((await GET(new Request(url))).status).toBe(200);
});

it("deleting the 3D body removes the buyer's tests and their files", async () => {
  const buyer = await confirmedBuyer();
  const { jobId } = await requestDeepFit(buyer.id, await fittedProduct());
  await runOnce();
  const other = await confirmedBuyer();
  await requestDeepFit(other.id, await fittedProduct());

  await deleteBody(buyer.id);
  expect(await db.deepFitJob.count({ where: { userId: buyer.id } })).toBe(0);
  expect(await storage().get(garmentKey(buyer.id, jobId, "M"))).toBeNull();
  expect(await storage().get(garmentKey(buyer.id, jobId, "S"))).toBeNull();
  expect(await db.deepFitJob.count({ where: { userId: other.id } })).toBe(1);
});

it("the sweep removes finished tests and their files 90 days after creation", async () => {
  const buyer = await confirmedBuyer();
  const { jobId } = await requestDeepFit(buyer.id, await fittedProduct());
  await runOnce();
  expect((await runSweep(new Date()))?.deepFit).toBe(0);
  const later = await runSweep(new Date(Date.now() + DEEP_FIT_KEEP_MS + 1000));
  expect(later.deepFit).toBe(1);
  expect(await db.deepFitJob.count()).toBe(0);
  expect(await storage().get(garmentKey(buyer.id, jobId, "M"))).toBeNull();
});
