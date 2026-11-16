import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  deleteBodyProfile,
  fitAccuracy,
  getFitView,
  nearestArchetype,
  saveBodyProfile,
  saveFitData,
  saveFitFeedback,
  setFitApproved,
} from "@/server/fit";
import {
  loadArchetypes,
  loadBodyFiles,
  loadFitManifest,
  type FitManifest,
} from "../../tools/fit-simulation/load";
import { makeBuyer, makeFactory, makeReceivedOrder, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), "public/fit-assets/seed-crew-tee/manifest.json"), "utf8"),
) as FitManifest;

const clusters = JSON.parse(
  readFileSync(join(process.cwd(), "tools/fit-simulation/seed/clusters.json"), "utf8"),
) as FitManifest["archetypes"];

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
  // The old per-motion garment files, for a standard shape without a body file.
  const motions = ["WALK", "RUN", "REACH", "SIT"].map((motion) => ({
    archetype: "men-07",
    motion,
    file: `men-07/${motion.toLowerCase()}-abc123.glb`,
  }));
  await loadFitManifest(db, { ...manifest, assets: motions }, variant.productId, {
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
  expect(archetype?.name).toBe("men-07");

  const view = await getFitView(variant.productId, buyer.id);
  expect(view.report?.simulated).toBe(true);
  expect(view.assets.map((a) => a.motion).sort()).toEqual(["REACH", "RUN", "SIT", "WALK"]);
  expect(view.assets[0].url).toMatch(/^\/fit-assets\/x\/men-07\//);
  // No body file for this standard shape yet: the old per-motion files are still used.
  expect(view.body).toBeNull();

  // With a standard body file, the garment is drawn over it and it moves like an own body.
  await loadBodyFiles(db, { "men-07": "men-07-abc123.glb" }, "/fit-assets/bodies");
  expect((await getFitView(variant.productId, buyer.id)).body).toEqual({
    url: "/fit-assets/bodies/men-07-abc123.glb",
    fitClass: "top",
    short: false,
    animated: true,
    own: false,
  });
  expect((await getFitView(variant.productId, null)).body).toBeNull();

  await deleteBodyProfile(buyer.id);
  expect(await db.bodyProfile.count({ where: { userId: buyer.id } })).toBe(0);
  expect((await getFitView(variant.productId, buyer.id)).report).toBeNull();
});

it("matches a buyer to the nearest of the 20 clusters and re-picks when measurements change", async () => {
  await loadArchetypes(db, clusters);
  expect(await db.bodyArchetype.count()).toBe(20);
  const at = (name: string) => {
    const p = clusters.find((a) => a.name === name)!.params;
    return {
      heightCm: p.height,
      gender: "WOMEN",
      ageBand: null,
      measurements: Object.fromEntries(
        (["chest", "waist", "hip"] as const).map((k) => [
          k,
          { value: p[k], low: p[k] - 2, high: p[k] + 2, source: "typed" },
        ]),
      ),
      captureMeta: null,
      consent: true,
    };
  };
  const w04 = clusters.find((a) => a.name === "women-04")!.params;
  expect((await nearestArchetype("WOMEN", w04))?.name).toBe("women-04");
  // A man's measurements look only among the men.
  expect((await nearestArchetype("MEN", w04))?.name).toMatch(/^men-/);

  const buyer = await makeBuyer();
  const first = await saveBodyProfile(buyer.id, at("women-04"));
  expect((await db.bodyArchetype.findUnique({ where: { id: first.archetypeId! } }))?.name).toBe(
    "women-04",
  );
  const again = await saveBodyProfile(buyer.id, at("women-09"));
  expect((await db.bodyArchetype.findUnique({ where: { id: again.archetypeId! } }))?.name).toBe(
    "women-09",
  );

  // Loading the clusters again removes shapes no longer in the list; their buyers are re-picked.
  await loadArchetypes(
    db,
    clusters.filter((a) => a.name !== "women-09"),
  );
  expect(await db.bodyArchetype.count()).toBe(19);
  const moved = await db.bodyProfile.findUniqueOrThrow({
    where: { userId: buyer.id },
    select: { archetype: { select: { name: true } } },
  });
  expect(moved.archetype?.name).toMatch(/^women-(0[1-8]|10)$/);
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
