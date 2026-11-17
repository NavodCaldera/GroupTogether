import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isSourced, sourcedFields } from "@/lib/materials/card";
import { findKind } from "@/lib/materials/measure";
import { RULES } from "@/lib/materials/rules";
import { readLibrary } from "@/lib/materials/seed-files";
import { db } from "@/server/db";
import { LibraryLoadError, loadLibrary, loadRules } from "@/server/material-load";
import {
  activateCalibrationSet,
  addCalibrationSwatch,
  addSwatchMeasurement,
  createCalibrationSet,
  materialReports,
  publishMaterial,
  reviewProductMaterial,
  setLabScope,
} from "@/server/material-admin";
import {
  addMeasurement,
  getMaterialCard,
  getProvenance,
  MaterialError,
  setProductMaterial,
} from "@/server/materials";
import { makeFactory, makeUser, resetDb } from "./helpers";

const lib = readLibrary();

beforeEach(async () => {
  await resetDb();
  await loadLibrary(db, lib);
});
afterAll(() => db.$disconnect());

async function factoryProduct() {
  const { factory, variant } = await makeFactory();
  return { factory, productId: variant.productId };
}

const cotton = [{ fiber: "cotton_upland", standard: null, pct: 100 }];
const pick = (over: Partial<Parameters<typeof setProductMaterial>[1]> = {}) => ({
  materialCode: "cj_crs",
  gsm: 160,
  composition: cotton,
  confirmRange: false,
  ...over,
});

describe("loader", () => {
  it("loads every material as a draft and is safe to run again", async () => {
    expect(await db.material.count()).toBe(33);
    expect(await db.material.count({ where: { status: "PUBLISHED" } })).toBe(0);
    await publishMaterial("admin", "cj_crs", true);
    await loadLibrary(db, lib);
    expect(await db.material.count()).toBe(33);
    expect((await db.material.findUniqueOrThrow({ where: { code: "cj_crs" } })).status).toBe(
      "PUBLISHED",
    );
    expect(await db.methodologyRule.count()).toBe(RULES.length);
  });

  it("refuses a changed rule that keeps its version", async () => {
    const changed = RULES.map((r) =>
      r.code === "WEIGHT" ? { ...r, formula: "something else" } : r,
    );
    await expect(db.$transaction((tx) => loadRules(tx, changed))).rejects.toBeInstanceOf(
      LibraryLoadError,
    );
  });

  it("refuses a library with an unsourced number", async () => {
    const bad = structuredClone(lib);
    bad.materials[0].gsm = [1, 2];
    await expect(loadLibrary(db, bad)).rejects.toBeInstanceOf(LibraryLoadError);
  });

  it("keeps stored rules append-only in the database", async () => {
    await expect(
      db.methodologyRule.updateMany({ where: { code: "WEIGHT" }, data: { formula: "x" } }),
    ).rejects.toThrow();
  });
});

describe("factory material", () => {
  beforeEach(() => publishMaterial("admin", "cj_crs", true));

  it("sets the material, mirrors gsm and stores a feel profile", async () => {
    const { factory, productId } = await factoryProduct();
    await setProductMaterial(productId, pick(), { sellerId: factory.id });
    const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.gsm).toBe(160);
    const pm = await db.productMaterial.findFirstOrThrow({
      where: { productId },
      include: { feel: { include: { axes: true } } },
    });
    expect(pm.verificationLevel).toBe("LIBRARY_ESTIMATE");
    expect(pm.needsReviewAt).toBeNull();
    const weight = pm.feel!.axes.find((a) => a.axis === "LIGHT_SUBSTANTIAL")!;
    expect(weight.basis).toBe("DECLARED");
    expect(weight.value).toBe(25);
  });

  it("refuses a draft material and another factory's product", async () => {
    const { factory, productId } = await factoryProduct();
    const other = await factoryProduct();
    await expect(
      setProductMaterial(productId, pick({ materialCode: "denim" }), { sellerId: factory.id }),
    ).rejects.toBeInstanceOf(MaterialError);
    await expect(
      setProductMaterial(productId, pick(), { sellerId: other.factory.id }),
    ).rejects.toThrow("Product not found");
  });

  it("asks to confirm figures far from the library, then lists them for review", async () => {
    const { factory, productId } = await factoryProduct();
    await expect(
      setProductMaterial(productId, pick({ gsm: 300 }), { sellerId: factory.id }),
    ).rejects.toThrow(/Tick the box/);
    await setProductMaterial(productId, pick({ gsm: 300, confirmRange: true }), {
      sellerId: factory.id,
    });
    const { review } = await materialReports();
    expect(review.map((r) => r.product.id)).toEqual([productId]);
    const admin = await makeUser("ADMIN", "FACTORY");
    await reviewProductMaterial(admin.id, review[0].id);
    expect((await materialReports()).review).toEqual([]);
  });

  it("refuses a composition that does not add up to 100", async () => {
    const { factory, productId } = await factoryProduct();
    await expect(
      setProductMaterial(
        productId,
        pick({ composition: [{ fiber: "cotton_upland", standard: null, pct: 90 }] }),
        { sellerId: factory.id },
      ),
    ).rejects.toThrow(/adds up to 90%/);
  });

  it("marks a result from a lab without a checked scope as not accredited", async () => {
    const { factory, productId } = await factoryProduct();
    await setProductMaterial(productId, pick(), { sellerId: factory.id });
    const kind = findKind("ISO_3801:mass_per_area")!;
    const lab = await db.lab.findFirstOrThrow();
    const m = await addMeasurement(
      productId,
      {
        kind,
        value: 172,
        lab: lab.code,
        labName: "",
        accreditationNo: "",
        reportRef: "R-1",
        testedOn: new Date("2026-10-01"),
        report: null,
      },
      { sellerId: factory.id, userId: factory.id },
    );
    expect(m.accredited).toBe(false);
    let card = await getMaterialCard(productId);
    expect(card!.axes.find((a) => a.axis === "LIGHT_SUBSTANTIAL")!.basis).toBe("DECLARED");
    expect(card!.badge).toBe("FACTORY_DECLARED");

    await db.lab.update({
      where: { id: lab.id },
      data: { scope: ["ISO_3801"], scopeVerifiedOn: new Date("2026-11-16") },
    });
    const m2 = await addMeasurement(
      productId,
      {
        kind,
        value: 172,
        lab: lab.code,
        labName: "",
        accreditationNo: "",
        reportRef: "R-2",
        testedOn: new Date("2026-10-01"),
        report: null,
      },
      { sellerId: factory.id, userId: factory.id },
    );
    expect(m2.accredited).toBe(true);
    card = await getMaterialCard(productId);
    const weight = card!.axes.find((a) => a.axis === "LIGHT_SUBSTANTIAL")!;
    expect(weight.basis).toBe("MEASURED");
    expect(weight.measurementIds).toEqual([m2.id]);
    expect(card!.details.weight.value.gsm).toBe(172);
  });

  it("builds a card whose every shown value is sourced and explained", async () => {
    const { factory, productId } = await factoryProduct();
    await setProductMaterial(productId, pick(), { sellerId: factory.id });
    const card = (await getMaterialCard(productId))!;
    const bad = sourcedFields(card).filter((f) => f.shown && !isSourced(f.provenance));
    expect(bad).toEqual([]);
    const why = await getProvenance(card);
    const shownCodes = card.axes.flatMap((a) => a.evidenceCodes);
    for (const c of shownCodes) expect(why.evidence.map((e) => e.code)).toContain(c);
    expect(why.evidence.every((e) => e.excerpt)).toBe(true);
    expect(why.rules.map((r) => r.code)).toContain("WEIGHT");
  });

  it("has no card for a product without a material", async () => {
    const { productId } = await factoryProduct();
    expect(await getMaterialCard(productId)).toBeNull();
  });
});

describe("owner sign-off, lab scopes and reference swatches", () => {
  const result = (kind: string, value: number, lab: string) => ({
    kind: findKind(kind)!,
    value,
    lab,
    labName: "",
    accreditationNo: "",
    reportRef: "",
    testedOn: new Date("2026-10-01"),
    report: null,
  });

  it("publishes every draft when the loader is told to", async () => {
    await loadLibrary(db, lib, { publish: { by: null } });
    expect(await db.material.count({ where: { status: "DRAFT" } })).toBe(0);
  });

  it("a checked scope makes the lab's results accredited and survives a reload", async () => {
    await publishMaterial("admin", "cj_crs", true);
    const { factory, productId } = await factoryProduct();
    await setProductMaterial(productId, pick(), { sellerId: factory.id });
    await addMeasurement(productId, result("ISO_3801:mass_per_area", 176, "sgs"), {
      sellerId: factory.id,
      userId: factory.id,
    });
    await setLabScope("sgs", {
      scope: ["ISO_3801"],
      checkedOn: new Date("2026-11-17"),
      accreditationNo: "TL 003-03",
      sourceUrl: "https://www.slab.lk/example-scope.pdf",
    });
    let card = (await getMaterialCard(productId))!;
    expect(card.axes.find((a) => a.axis === "LIGHT_SUBSTANTIAL")!.basis).toBe("MEASURED");

    await loadLibrary(db, lib);
    const lab = await db.lab.findUniqueOrThrow({ where: { code: "sgs" } });
    expect(lab.scope).toEqual(["ISO_3801"]);
    card = (await getMaterialCard(productId))!;
    expect(card.axes.find((a) => a.axis === "LIGHT_SUBSTANTIAL")!.basis).toBe("MEASURED");
  });

  it("an active set of 10 accredited swatches turns breathability into a measured point", async () => {
    await publishMaterial("admin", "cj_crs", true);
    const admin = await makeUser("ADMIN", "FACTORY");
    await setLabScope("slsi", {
      scope: ["ISO_9237"],
      checkedOn: new Date("2026-11-17"),
      accreditationNo: "TL 016-06",
      sourceUrl: "https://www.slab.lk/example-scope.pdf",
    });
    await createCalibrationSet("GB-REF-1", "Reference set");
    for (let i = 1; i <= 10; i++) {
      await addCalibrationSwatch("GB-REF-1", "cj_crs", `R${i}`);
      const sw = await db.calibrationSwatch.findFirstOrThrow({ where: { label: `R${i}` } });
      await addSwatchMeasurement(
        sw.id,
        {
          kind: findKind("ISO_9237:air_permeability")!,
          value: 50 * i,
          lab: "slsi",
          testedOn: new Date("2026-10-01"),
          reportRef: "",
        },
        admin.id,
      );
    }
    const { factory, productId } = await factoryProduct();
    await setProductMaterial(productId, pick(), { sellerId: factory.id });
    await addMeasurement(productId, result("ISO_9237:air_permeability", 275, "slsi"), {
      sellerId: factory.id,
      userId: factory.id,
    });
    let breath = (await getMaterialCard(productId))!.axes.find(
      (a) => a.axis === "BREATHABLE_INSULATING",
    )!;
    expect(breath.basis).not.toBe("MEASURED");

    await activateCalibrationSet("GB-REF-1", true);
    breath = (await getMaterialCard(productId))!.axes.find(
      (a) => a.axis === "BREATHABLE_INSULATING",
    )!;
    expect(breath.basis).toBe("MEASURED");
    expect(breath.value).toBeGreaterThan(30);
    expect(breath.value).toBeLessThan(70);
  });
});
