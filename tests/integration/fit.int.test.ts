import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  deleteBodyProfile,
  fitAccuracy,
  getFitView,
  saveBodyProfile,
  saveFitData,
  saveFitFeedback,
  setFitApproved,
} from "@/server/fit";
import { loadFitManifest, type FitManifest } from "../../tools/fit-simulation/load";
import { makeBuyer, makeFactory, makeReceivedOrder, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), "public/fit-assets/seed-crew-tee/manifest.json"), "utf8"),
) as FitManifest;

const fabric = {
  fabricStretchPct: 5,
  gsm: 180,
  weave: "Jersey",
  thermalMinC: 24,
  thermalMaxC: 32,
  breathability: 4,
  careNotes: null,
};
const chart = { M: { chest: 102, waist: 98 }, L: { chest: 108, waist: 104 } };
const profile = {
  heightCm: 172,
  gender: "MEN",
  ageBand: null,
  measurements: {
    chest: { value: 100, low: 96, high: 104, source: "photo" },
    waist: { value: 88, low: 86, high: 90, source: "typed" },
  },
  captureMeta: null,
  consent: true,
};

it("a factory's fit data waits for approval and only its own listing can be edited", async () => {
  const { factory, variant } = await makeFactory();
  const other = await makeFactory();
  const admin = await makeUser("ADMIN", "FACTORY");
  await saveFitData(variant.productId, { chart, ...fabric }, { sellerId: factory.id });
  await expect(
    saveFitData(variant.productId, { chart, ...fabric }, { sellerId: other.factory.id }),
  ).rejects.toThrow("Product not found");

  const buyer = await makeBuyer();
  await saveBodyProfile(buyer.id, profile);
  // Unapproved: material shows, the size chart and report do not.
  let view = await getFitView(variant.productId, buyer.id);
  expect(view.material?.gsm).toBe(180);
  expect(view.chart).toBeNull();
  expect(view.report).toBeNull();

  await setFitApproved(admin.id, variant.productId, true);
  view = await getFitView(variant.productId, buyer.id);
  expect(view.chart?.sizes).toEqual(["M", "L"]);
  expect(view.report?.sizeOptions.map((o) => o.size)).toEqual(["M", "L"]);

  // A factory change clears the approval again.
  await saveFitData(variant.productId, { chart, ...fabric, gsm: 200 }, { sellerId: factory.id });
  expect(await db.product.findUnique({ where: { id: variant.productId } })).toMatchObject({
    fitApprovedAt: null,
    gsm: 200,
  });
});

it("stores only numbers and consent, matches an archetype, and deletes on request", async () => {
  const { variant } = await makeFactory();
  await loadFitManifest(db, manifest, variant.productId, {
    baseUrl: "/fit-assets/x",
    approve: true,
  });
  const buyer = await makeBuyer();
  await expect(saveBodyProfile(buyer.id, { ...profile, consent: false })).rejects.toThrow();
  const saved = await saveBodyProfile(buyer.id, {
    ...profile,
    measurements: {
      ...profile.measurements,
      hip: { value: 100, low: 98, high: 102, source: "photo" },
    },
  });
  expect(saved.consentAt).toBeInstanceOf(Date);
  const archetype = await db.bodyArchetype.findUnique({ where: { id: saved.archetypeId! } });
  expect(archetype?.name).toBe("men-broad-174");

  const view = await getFitView(variant.productId, buyer.id);
  expect(view.report?.simulated).toBe(true);
  expect(view.assets.map((a) => a.motion).sort()).toEqual(["REACH", "RUN", "SIT", "WALK"]);
  expect(view.assets[0].url).toMatch(/^\/fit-assets\/x\/men-broad-174\//);

  await deleteBodyProfile(buyer.id);
  expect(await db.bodyProfile.count({ where: { userId: buyer.id } })).toBe(0);
  expect((await getFitView(variant.productId, buyer.id)).report).toBeNull();
});

it("takes fit feedback once, for the buyer's own collected line", async () => {
  const { buyer, line, variant } = await makeReceivedOrder();
  const stranger = await makeBuyer();
  const pending = await makeReceivedOrder({ collectedAt: null });
  await expect(
    saveFitFeedback(stranger.id, { orderLineId: line.id, verdict: "GOOD" }),
  ).rejects.toThrow("Order line not found");
  await expect(
    saveFitFeedback(pending.buyer.id, { orderLineId: pending.line.id, verdict: "GOOD" }),
  ).rejects.toThrow("Order line not found");

  await saveFitFeedback(buyer.id, {
    orderLineId: line.id,
    verdict: "TOO_TIGHT",
    regionNotes: { chest: "TOO_TIGHT", nonsense: "GOOD" },
  });
  await expect(
    saveFitFeedback(buyer.id, { orderLineId: line.id, verdict: "GOOD" }),
  ).rejects.toThrow("already");
  const row = await db.fitFeedback.findUniqueOrThrow({ where: { orderLineId: line.id } });
  expect(row).toMatchObject({
    purchasedSize: "M",
    verdict: "TOO_TIGHT",
    productId: variant.productId,
  });
  expect(row.regionNotes).toEqual({ chest: "TOO_TIGHT" });
  expect((await fitAccuracy())[0]).toMatchObject({ total: 1, tight: 1, good: 0 });
});
