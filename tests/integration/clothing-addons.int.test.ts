import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getFitView, saveFitData, setFitApproved } from "@/server/fit";
import { getDeepFit, requestDeepFit } from "@/server/deep-fit";
import { getMaterialCard, setProductMaterial } from "@/server/materials";
import { fileReturn } from "@/server/returns";
import { rateProduct } from "@/server/ratings";
import { giftPhotoFile, makeReceivedOrder, makeUser, resetDb } from "./helpers";

// Fit, materials and clothing return reasons follow Category.features and returnReasons (DEC-029).
beforeEach(resetDb);
afterAll(() => db.$disconnect());

const STATIONERY = "cat_stationery";

async function stationery(productId: string) {
  await db.category.upsert({
    where: { id: STATIONERY },
    create: {
      id: STATIONERY,
      slug: "stationery",
      name: "Stationery",
      path: `/${STATIONERY}/`,
      features: [],
      returnReasons: [],
    },
    update: {},
  });
  await db.product.update({ where: { id: productId }, data: { categoryId: STATIONERY } });
}

const fitFields = {
  chart: { M: { chest: 100 } },
  fabricStretchPct: null,
  careNotes: null,
};

describe("clothing add-ons outside clothing", () => {
  it("rejects fit and material changes and shows neither", async () => {
    const o = await makeReceivedOrder();
    const productId = o.variant.productId;
    const admin = await makeUser("ADMIN", "FACTORY");
    await saveFitData(productId, fitFields, { adminId: admin.id });
    await stationery(productId);

    await expect(saveFitData(productId, fitFields, { adminId: admin.id })).rejects.toThrow(
      /only for clothing/,
    );
    await expect(setFitApproved(admin.id, productId, true)).rejects.toThrow(/only for clothing/);
    await expect(
      setProductMaterial(
        productId,
        { materialCode: "cj_crs", gsm: 180, composition: [], confirmRange: false },
        { adminId: admin.id },
      ),
    ).rejects.toThrow(/only for clothing/);
    await expect(requestDeepFit(o.buyer.id, productId)).rejects.toThrow();
    expect(await getDeepFit(o.buyer.id, productId)).toBeNull();
    expect(await getMaterialCard(productId)).toBeNull();
    const view = await getFitView(productId, o.buyer.id);
    expect(view.chart).toBeNull();
    expect(view.material).toBeNull();
  });
});

describe("return and report reasons by category", () => {
  const input = (over: object) => ({
    qty: 1,
    note: "Note",
    photos: [] as File[],
    fault: "BUYER" as const,
    ...over,
  });

  it("offers clothing reasons only in clothing", async () => {
    const o = await makeReceivedOrder();
    await fileReturn(o.buyer.id, o.line.id, input({ buyerReason: "SIZE" }));
    expect(await db.returnRequest.count()).toBe(1);

    const s = await makeReceivedOrder();
    await stationery(s.variant.productId);
    await expect(fileReturn(s.buyer.id, s.line.id, input({ buyerReason: "SIZE" }))).rejects.toThrow(
      /reason/,
    );
    await expect(
      fileReturn(
        s.buyer.id,
        s.line.id,
        input({ fault: "FACTORY", reason: "STITCHING", photos: [giftPhotoFile()] }),
      ),
    ).rejects.toThrow(/reason/);
    await fileReturn(
      s.buyer.id,
      s.line.id,
      input({ fault: "FACTORY", reason: "MISSING_PARTS", photos: [giftPhotoFile()] }),
    );
    expect(await db.returnRequest.count({ where: { reason: "MISSING_PARTS" } })).toBe(1);

    await expect(
      rateProduct(s.buyer.id, s.order.id, s.variant.productId, 2, {
        reason: "SIZE",
        note: "Too small",
        photos: [],
      }),
    ).rejects.toThrow(/reason/);
    await rateProduct(s.buyer.id, s.order.id, s.variant.productId, 2, {
      reason: "NOT_AS_DESCRIBED",
      note: "Different colour",
      photos: [],
    });
    expect(await db.qualityReport.count({ where: { reason: "NOT_AS_DESCRIBED" } })).toBe(1);
  });
});
