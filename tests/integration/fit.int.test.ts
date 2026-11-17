import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, expect, it } from "vitest";
import { regionTension } from "@/lib/fit/report";
import { db } from "@/server/db";
import { FIT_DATA_SELECT, fitDataHash } from "@/server/deep-fit-jobs";
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
import { exportDrapeJobs } from "../../tools/cloth-sim/export";
import {
  drapeSummary,
  loadArchetypes,
  loadBodyFiles,
  loadDrapes,
  loadFitManifest,
  type DrapeManifest,
  type FitManifest,
} from "../../tools/fit-simulation/load";
import { skinnedGlb } from "../e2e/fixtures/glb.mjs";
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
    garments: null,
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

it("cluster drapes give the buyer's shape simulated tensions and garments until the chart changes", async () => {
  const { variant } = await makeFactory();
  const productId = variant.productId;
  const admin = await makeUser("ADMIN", "FACTORY");
  await loadArchetypes(db, clusters);
  await loadBodyFiles(db, { "men-07": "men-07-abc123.glb" }, "/fit-assets/bodies");
  await saveFitData(productId, { chart, ...fabric }, { adminId: admin.id });
  const m07 = clusters.find((a) => a.name === "men-07")!.params;
  const buyer = await makeBuyer();
  const typed = (value: number) => ({ value, low: value, high: value, source: "typed" });
  await saveBodyProfile(buyer.id, {
    ...profile,
    heightCm: m07.height,
    measurements: { chest: typed(m07.chest + 2), waist: typed(m07.waist), hip: typed(m07.hip) },
  });
  expect((await getFitView(productId, buyer.id)).body?.garments).toBeNull();

  // The export the batch reads: the approved product, its chart and fabric, the shapes' bodies.
  const hash = fitDataHash(
    await db.product.findUniqueOrThrow({ where: { id: productId }, select: FIT_DATA_SELECT }),
  );
  const exported = await exportDrapeJobs(db, { root: "/repo" });
  expect(exported.products).toEqual([
    {
      id: productId,
      title: expect.any(String),
      fitDataHash: hash,
      gender: null,
      job: {
        cls: "top",
        short: false,
        sizes: chart,
        fabric: { gsm: 180, stretch_pct: 5, weave: "Jersey" },
        motions: ["WALK", "RUN", "REACH", "SIT"],
      },
    },
  ]);
  expect(exported.archetypes).toEqual([
    {
      name: "men-07",
      gender: "MEN",
      body: join("/repo", "public/fit-assets/bodies/men-07-abc123.glb"),
    },
  ]);

  // A fixture batch output: two shapes, sizes M and L; men-03's L blew up.
  const out = mkdtempSync(join(tmpdir(), "drapes-"));
  const assetsDir = mkdtempSync(join(tmpdir(), "drape-assets-"));
  const glb = (radius: number) => {
    const file = `${productId}/g-${radius}.glb`;
    mkdirSync(join(out, productId), { recursive: true });
    writeFileSync(
      join(out, file),
      skinnedGlb({ attribute: "_REGION_ID", bottom: 1, top: 1.5, radius, value: () => 0 }),
    );
    return file;
  };
  const sim = { M: { chest: 0.8, waist: 0.4 }, L: { chest: 0.3, waist: 0.1 } };
  const drapes: DrapeManifest = {
    products: [
      {
        id: productId,
        fitDataHash: hash,
        drapes: [
          { archetype: "men-07", size: "M", tension: sim.M, garment: glb(0.2) },
          {
            archetype: "men-07",
            size: "L",
            tension: { ...sim.L, nonsense: 1 },
            garment: glb(0.21),
          },
          { archetype: "men-03", size: "M", tension: sim.M, garment: glb(0.22) },
          {
            archetype: "men-03",
            size: "L",
            tension: { chest: 1, waist: 1 },
            garment: null,
            note: "unstable",
          },
        ],
      },
      // Simulated from fit data the product no longer has: refused, and its files not copied.
      {
        id: productId,
        fitDataHash: "0".repeat(64),
        drapes: [{ archetype: "men-07", size: "M", tension: sim.M, garment: glb(0.3) }],
      },
      {
        id: "no-such-product",
        fitDataHash: hash,
        drapes: [{ archetype: "men-07", size: "M", tension: sim.M, garment: glb(0.31) }],
      },
    ],
  };
  writeFileSync(join(out, "manifest.json"), JSON.stringify(drapes));
  try {
    const loaded = await loadDrapes(db, out, { assetsDir, baseUrl: "/fit-assets" });
    expect(loaded.loaded).toEqual([{ productId, drapes: 3, tensions: 6 }]);
    expect(loaded.skipped.map((s) => s.reason)).toEqual(["fit data changed", "product not found"]);
    expect(readdirSync(join(assetsDir, "drapes"))).toHaveLength(3);
    // The command line says what it skipped and exits non-zero.
    const summary = drapeSummary(loaded);
    expect(summary.exitCode).toBe(1);
    expect(summary.lines.at(-1)).toBe("Skipped 2 of 3 products");

    const view = await getFitView(productId, buyer.id);
    expect(view.body).toMatchObject({ url: "/fit-assets/bodies/men-07-abc123.glb", own: false });
    const garments = view.body!.garments!;
    expect(Object.keys(garments).sort()).toEqual(["L", "M"]);
    expect(garments.M).toMatch(/^\/fit-assets\/drapes\/men-07-M-[0-9a-f]{10}\.glb$/);
    expect(garments.L).not.toBe(garments.M);
    for (const url of Object.values(garments))
      expect(existsSync(join(assetsDir, url.replace(/^\/fit-assets\//, "")))).toBe(true);

    // The simulated tension plus the per-buyer adjustment for a chest 2 cm bigger than men-07's.
    const m = view.report!.sizeOptions.find((o) => o.size === "M")!;
    const chestM = regionTension("chest", 102, m07.chest + 2, 5, {
      base: 0.8,
      archetypeCm: m07.chest,
    });
    expect(m.regions.find((r) => r.region === "chest")!.tension).toBeCloseTo(chestM, 3);
    expect(view.report!.simulated).toBe(true);
    const rows = await db.garmentRegionTension.findMany({ where: { productId } });
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.note))).toEqual(new Set(["simulated"]));
    expect(await db.clusterDrape.count({ where: { productId } })).toBe(3);

    // Loading again replaces, not duplicates.
    await loadDrapes(db, out, { assetsDir, baseUrl: "/fit-assets" });
    expect(await db.clusterDrape.count({ where: { productId } })).toBe(3);

    // A shape given a new body file loses its drapes and simulated tensions; the same file keeps them.
    const shapeId = async (name: string) =>
      (await db.bodyArchetype.findUniqueOrThrow({ where: { name } })).id;
    const [id07, id03] = [await shapeId("men-07"), await shapeId("men-03")];
    await loadBodyFiles(db, { "men-07": "men-07-abc123.glb" }, "/fit-assets/bodies");
    expect(await db.clusterDrape.count({ where: { productId } })).toBe(3);
    await loadBodyFiles(db, { "men-07": "men-07-def456.glb" }, "/fit-assets/bodies");
    expect(await db.clusterDrape.count({ where: { archetypeId: id07 } })).toBe(0);
    expect(await db.garmentRegionTension.count({ where: { archetypeId: id07 } })).toBe(0);
    expect(await db.clusterDrape.count({ where: { archetypeId: id03 } })).toBe(1);
    expect(await db.garmentRegionTension.count({ where: { archetypeId: id03 } })).toBe(2);
    await loadDrapes(db, out, { assetsDir, baseUrl: "/fit-assets" });
    expect(await db.clusterDrape.count({ where: { productId } })).toBe(3);
    // A tension row from the fit pipeline, not the cloth simulation.
    await db.garmentRegionTension.create({
      data: {
        productId,
        archetypeId: id03,
        size: "L",
        region: "HIP",
        baseTension: 0.4,
        note: "seed",
      },
    });

    // Saving the same fit data keeps the drapes; a changed chart drops them.
    await saveFitData(productId, { chart, ...fabric }, { adminId: admin.id });
    expect(await db.clusterDrape.count({ where: { productId } })).toBe(3);
    await saveFitData(
      productId,
      { chart: { ...chart, M: { chest: 104, waist: 98 } }, ...fabric },
      { adminId: admin.id },
    );
    expect(await db.clusterDrape.count({ where: { productId } })).toBe(0);
    const after = await getFitView(productId, buyer.id);
    expect(after.body?.garments).toBeNull();
    // Simulated tensions go with the drapes; the report falls back to the chart alone.
    expect(await db.garmentRegionTension.count({ where: { productId, note: "simulated" } })).toBe(
      0,
    );
    expect(await db.garmentRegionTension.count({ where: { productId, note: "seed" } })).toBe(1);
    expect(after.report!.simulated).toBe(false);
    const m2 = after.report!.sizeOptions.find((o) => o.size === "M")!;
    expect(m2.regions.find((r) => r.region === "chest")!.tension).toBeCloseTo(
      regionTension("chest", 104, m07.chest + 2, 5, null),
      3,
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
    rmSync(assetsDir, { recursive: true, force: true });
  }
});
