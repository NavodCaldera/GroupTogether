import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isSourced, sourcedFields } from "@/lib/materials/card";
import { findKind } from "@/lib/materials/measure";
import { RULES } from "@/lib/materials/rules";
import { readLibrary } from "@/lib/materials/seed-files";
import { db } from "@/server/db";
import { LibraryLoadError, loadLibrary, loadRules } from "@/server/material-load";
import { materialReports, publishMaterial, reviewProductMaterial } from "@/server/material-admin";
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
