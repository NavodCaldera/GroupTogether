import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { saveProduct } from "@/server/catalogue";
import {
  FactoryCategoryError,
  factoryCategoryView,
  pendingFactoryReviews,
  requestCategory,
  reviewFactoryCategory,
  reviewFactoryDocument,
  uploadFactoryDocument,
} from "@/server/factory-categories";
import { CLOTHING_ROOT_ID, categoryIdOf } from "@/lib/categories";
import { makeUser, resetDb, slipFile } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const SHIRTS = categoryIdOf("clothing/men/shirts");
const listing = (categoryId: string) => ({
  title: "Any product",
  brand: "Factory",
  categoryId,
  price: "1400",
});

async function factory() {
  const f = await db.user.update({
    where: { id: (await makeUser()).id },
    data: {
      role: "SELLER",
      factoryProfile: { create: { complianceDueAt: new Date("2099-01-01") } },
    },
  });
  return f;
}

/** A restricted root with one leaf, outside clothing. */
async function foodTree() {
  const root = await db.category.create({
    data: {
      id: "cat_food",
      slug: "food",
      name: "Food",
      path: "/cat_food/",
      needsApproval: true,
    },
  });
  const leaf = await db.category.create({
    data: {
      id: "cat_food_tea",
      parentId: root.id,
      slug: "food/tea",
      name: "Tea",
      path: "/cat_food/cat_food_tea/",
    },
  });
  return { root, leaf };
}

describe("factory categories (CATG-003)", () => {
  it("refuses a factory listing outside an approved category and allows the approved subtree", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const f = await factory();
    await expect(saveProduct(null, listing(SHIRTS), null, { sellerId: f.id })).rejects.toThrow(
      "isn't approved for this category",
    );
    const req = await requestCategory(f.id, CLOTHING_ROOT_ID);
    await expect(requestCategory(f.id, CLOTHING_ROOT_ID)).rejects.toThrow("Already requested");
    await expect(saveProduct(null, listing(SHIRTS), null, { sellerId: f.id })).rejects.toThrow(
      "isn't approved",
    );
    await reviewFactoryCategory(admin.id, req.id, "APPROVE");
    const p = await saveProduct(null, listing(SHIRTS), null, { sellerId: f.id });
    expect(p).toMatchObject({ sellerId: f.id, categoryId: SHIRTS });
    await expect(requestCategory(f.id, SHIRTS)).rejects.toThrow("Already approved");
    await expect(reviewFactoryCategory(admin.id, req.id, "REJECT")).rejects.toThrow(
      "already reviewed",
    );
  });

  it("leaves admin listings unaffected", async () => {
    expect(await saveProduct(null, listing(SHIRTS), null)).toMatchObject({ sellerId: null });
  });

  it("lets a rejected category be asked again", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const f = await factory();
    const req = await requestCategory(f.id, CLOTHING_ROOT_ID);
    await reviewFactoryCategory(admin.id, req.id, "REJECT");
    await expect(saveProduct(null, listing(SHIRTS), null, { sellerId: f.id })).rejects.toThrow(
      "isn't approved",
    );
    await requestCategory(f.id, CLOTHING_ROOT_ID);
    expect(
      await db.factoryCategory.findUniqueOrThrow({
        where: { id: req.id },
        select: { status: true },
      }),
    ).toEqual({ status: "PENDING" });
  });

  it("only Factories admins review, and each factory sees only its own requests", async () => {
    const f = await factory();
    const other = await factory();
    const req = await requestCategory(f.id, CLOTHING_ROOT_ID);
    await requestCategory(other.id, SHIRTS);
    const doc = await uploadFactoryDocument(f.id, "TRADEMARK_PROOF", slipFile());
    for (const area of ["CORE", "AGENTS", "PREMIUM"] as const) {
      const a = await makeUser("ADMIN", area);
      await expect(reviewFactoryCategory(a.id, req.id, "APPROVE")).rejects.toThrow(
        FactoryCategoryError,
      );
      await expect(reviewFactoryDocument(a.id, doc.id, "APPROVE")).rejects.toThrow(
        FactoryCategoryError,
      );
      await expect(pendingFactoryReviews(a.id)).rejects.toThrow(FactoryCategoryError);
    }
    // A factory account is never an admin, so it cannot approve its own or another's request.
    await expect(reviewFactoryCategory(f.id, req.id, "APPROVE")).rejects.toThrow(
      FactoryCategoryError,
    );
    await expect(reviewFactoryCategory(other.id, req.id, "APPROVE")).rejects.toThrow(
      FactoryCategoryError,
    );
    const locked = await makeUser("ADMIN", "FACTORY");
    await db.user.update({ where: { id: locked.id }, data: { locked: true } });
    await expect(reviewFactoryCategory(locked.id, req.id, "APPROVE")).rejects.toThrow(
      FactoryCategoryError,
    );
    const mine = await factoryCategoryView(f.id);
    expect(mine.requests.map((r) => r.categoryId)).toEqual([CLOTHING_ROOT_ID]);
    expect(mine.documents.map((d) => d.id)).toEqual([doc.id]);
    expect((await factoryCategoryView(other.id)).documents).toEqual([]);
    expect(await db.factoryCategory.count({ where: { status: "APPROVED" } })).toBe(0);
  });

  it("another factory's approval does not let a factory list", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const f = await factory();
    const other = await factory();
    await reviewFactoryCategory(
      admin.id,
      (await requestCategory(other.id, CLOTHING_ROOT_ID)).id,
      "APPROVE",
    );
    await expect(saveProduct(null, listing(SHIRTS), null, { sellerId: f.id })).rejects.toThrow(
      "isn't approved",
    );
  });

  it("refuses requests and documents from staff and brand logins", async () => {
    const f = await factory();
    const staff = await db.user.update({
      where: { id: (await makeUser()).id },
      data: { role: "SELLER", factoryId: f.id, factoryRole: "OWNER" },
    });
    const brand = await db.user.update({
      where: { id: (await makeUser()).id },
      data: { role: "SELLER", isBrand: true },
    });
    for (const id of [staff.id, brand.id]) {
      await expect(requestCategory(id, CLOTHING_ROOT_ID)).rejects.toThrow("Factory not found");
      await expect(uploadFactoryDocument(id, "PRODUCT_LICENCE", slipFile())).rejects.toThrow(
        "Factory not found",
      );
    }
    await expect(uploadFactoryDocument(f.id, "BR_CERT", slipFile())).rejects.toThrow(
      "Choose a document",
    );
  });

  it("approves a restricted category only after a product licence is approved", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const { root, leaf } = await foodTree();
    const f = await factory();
    const other = await factory();
    const req = await requestCategory(f.id, leaf.id);
    await expect(reviewFactoryCategory(admin.id, req.id, "APPROVE")).rejects.toThrow(
      "product licence",
    );
    // Another factory's licence does not count.
    const theirs = await uploadFactoryDocument(other.id, "PRODUCT_LICENCE", slipFile());
    await reviewFactoryDocument(admin.id, theirs.id, "APPROVE");
    const mine = await uploadFactoryDocument(f.id, "PRODUCT_LICENCE", slipFile());
    await expect(reviewFactoryCategory(admin.id, req.id, "APPROVE")).rejects.toThrow(
      "product licence",
    );
    await reviewFactoryDocument(admin.id, mine.id, "APPROVE");
    await expect(reviewFactoryDocument(admin.id, mine.id, "REJECT")).rejects.toThrow(
      "already reviewed",
    );
    await reviewFactoryCategory(admin.id, req.id, "APPROVE");
    expect(await saveProduct(null, listing(leaf.id), null, { sellerId: f.id })).toMatchObject({
      categoryId: leaf.id,
    });
    expect((await pendingFactoryReviews(admin.id)).requests).toEqual([]);
    expect(root.needsApproval).toBe(true);
  });

  it("migration backfill approves clothing for every existing factory", async () => {
    const f = await factory();
    const brand = await db.user.update({
      where: { id: (await makeUser()).id },
      data: { role: "SELLER", isBrand: true },
    });
    const sql = readFileSync(
      "prisma/migrations/20261124200000_factory_categories/migration.sql",
      "utf8",
    );
    const backfill = sql
      .slice(sql.indexOf("-- Backfill: every existing factory"))
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.includes("INSERT"));
    expect(backfill).toHaveLength(2);
    for (const s of backfill) await db.$executeRawUnsafe(s);
    expect(
      await db.factoryCategory.findMany({
        where: { factoryId: { in: [f.id, brand.id] } },
        select: { factoryId: true, categoryId: true, status: true },
      }),
    ).toEqual([{ factoryId: f.id, categoryId: CLOTHING_ROOT_ID, status: "APPROVED" }]);
  });
});
