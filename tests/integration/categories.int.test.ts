import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { CatalogueError, listProducts, saveProduct } from "@/server/catalogue";
import { categoryChoices, ensureCategoryTree, loadCategoryTree } from "@/server/categories";
import { CLOTHING_ROOT_ID, categoryIdOf, kindSlug } from "@/lib/categories";
import { resetDb, sizeVariant } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const MIGRATION = readFileSync(
  "prisma/migrations/20261123100000_category_tree/migration.sql",
  "utf8",
);
const block = (name: string) =>
  MIGRATION.slice(
    MIGRATION.indexOf(`-- ${name}:start`) + `-- ${name}:start`.length,
    MIGRATION.indexOf(`-- ${name}:end`),
  )
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.split("\n").every((l) => l.trim().startsWith("--")));

class Rollback extends Error {}
/** Runs `fn` in a transaction that is always rolled back, returning what it read. */
async function rolledBack<T>(
  fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>,
) {
  let out: T | undefined;
  await db
    .$transaction(async (tx) => {
      out = await fn(tx);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
  return out as T;
}

const snapshot = async (tx: typeof db | Parameters<Parameters<typeof db.$transaction>[0]>[0]) => ({
  categories: (
    await tx.category.findMany({
      orderBy: { id: "asc" },
      omit: { createdAt: true, updatedAt: true },
    })
  ).map((c) => ({
    ...c,
    commissionPct: c.commissionPct?.toString() ?? null,
    minCommission: c.minCommission?.toString() ?? null,
  })),
  defs: await tx.attributeDef.findMany({ orderBy: { id: "asc" } }),
  options: await tx.attributeOption.findMany({ orderBy: { id: "asc" } }),
  links: await tx.categoryAttribute.findMany({ orderBy: { defId: "asc" } }),
});

describe("category_tree migration", () => {
  it("inserts the same tree as the seed function", async () => {
    const seeded = await snapshot(db);
    expect(seeded.categories.length).toBeGreaterThan(20);
    const migrated = await rolledBack(async (tx) => {
      await tx.$executeRawUnsafe(
        `TRUNCATE "Product", "Category", "AttributeDef", "AttributeOption", "CategoryAttribute" CASCADE`,
      );
      for (const s of block("tree")) await tx.$executeRawUnsafe(s);
      // Phase 8 sets the clothing return reasons on the roots.
      const reasons = readFileSync(
        "prisma/migrations/20261125100000_category_return_reasons/migration.sql",
        "utf8",
      );
      await tx.$executeRawUnsafe(reasons.slice(reasons.indexOf('UPDATE "Category"')));
      return snapshot(tx);
    });
    expect(migrated).toEqual(seeded);
  });

  it("is safe to write again", async () => {
    await ensureCategoryTree();
    expect(await db.category.count()).toBe((await snapshot(db)).categories.length);
  });
  // The backfill that linked products by their old kind column ran once; phase 4 (DEC-029)
  // dropped that column, so it is checked by the migration on CI's fresh database instead.
});

describe("saving a product's category", () => {
  const base = { title: "Tree shirt", brand: "Test", price: "1400" };

  it("stores the chosen leaf with the general fields", async () => {
    const id = categoryIdOf(kindSlug("women-dresses"));
    const p = await saveProduct(null, { ...base, categoryId: id }, null);
    expect(p).toMatchObject({
      categoryId: id,
      specs: {},
      condition: "NEW",
      sellUnit: "piece",
      minOrderQty: 1,
      stepQty: 1,
      hazmat: false,
    });
    const moved = await saveProduct(
      p.id,
      {
        ...base,
        categoryId: "cat_shoes",
        condition: "B_GRADE",
        sellUnit: "pack",
        minOrderQty: "12",
        stepQty: "12",
        shelfLifeDays: "",
        hazmat: "on",
      },
      null,
    );
    expect(moved).toMatchObject({
      categoryId: "cat_shoes",
      condition: "B_GRADE",
      sellUnit: "pack",
      minOrderQty: 12,
      stepQty: 12,
      shelfLifeDays: null,
      hazmat: true,
    });
  });

  it("maps an older kind to the tree", async () => {
    const p = await saveProduct(null, { ...base, kind: "men-shirts" }, null);
    expect(p.categoryId).toBe("cat_clothing_men_shirts");
  });

  it("refuses a missing, parent or inactive category", async () => {
    await expect(saveProduct(null, base, null)).rejects.toThrow("Choose a category");
    for (const categoryId of [CLOTHING_ROOT_ID, "cat_clothing_men", "nope"])
      await expect(saveProduct(null, { ...base, categoryId }, null)).rejects.toThrow(
        CatalogueError,
      );
    await db.category.update({ where: { id: "cat_clothing_men" }, data: { active: false } });
    await expect(
      saveProduct(null, { ...base, categoryId: "cat_clothing_men_shirts" }, null),
    ).rejects.toThrow("Choose a category");
  });
});

describe("shop by category", () => {
  it("filters a subtree by path", async () => {
    const make = async (kind: string) => {
      const p = await saveProduct(
        null,
        { title: kind, brand: "Test", price: "1000", categoryId: categoryIdOf(kindSlug(kind)) },
        null,
      );
      await db.variant.create({ data: { productId: p.id, ...sizeVariant("M"), available: 3 } });
      return p.id;
    };
    const shirt = await make("men-shirts");
    const jeans = await make("men-jeans");
    const dress = await make("women-dresses");
    const tree = await loadCategoryTree();
    const ids = async (id: string) =>
      (await listProducts({ categoryPath: tree.get(id)!.path })).map((p) => p.id).sort();
    expect(await ids("cat_clothing_men")).toEqual([shirt, jeans].sort());
    expect(await ids("cat_clothing_women_dresses")).toEqual([dress]);
    expect(await ids(CLOTHING_ROOT_ID)).toHaveLength(3);
  });

  it("offers only the buyer's audience and categories without one", async () => {
    const groups = await categoryChoices({ audience: "WOMEN", by: "slug" });
    const labels = groups.map((g) => g.label);
    expect(labels).toContain("Clothing › Women");
    expect(labels).not.toContain("Clothing › Men");
    expect(groups.flatMap((g) => g.options.map((o) => o.value))).toContain("shoes");
    const dresses = groups
      .flatMap((g) => g.options)
      .find((o) => o.value === "clothing/women/dresses");
    const size = dresses?.attributes.find((a) => a.key === "size");
    expect(size).toMatchObject({ isVariantAxis: true, filterable: true });
    expect(size?.values.map((v) => v.value)).toContain("M");
  });
});

describe("product specs", () => {
  const base = { title: "Exercise book", brand: "Atlas", price: "250" };

  async function stationery() {
    const root = await db.category.create({
      data: {
        id: "cat_t_stationery",
        slug: "t-stationery",
        name: "Stationery",
        path: "/cat_t_stationery/",
      },
    });
    const leaf = await db.category.create({
      data: {
        id: "cat_t_books",
        parentId: root.id,
        slug: "t-stationery/books",
        name: "Books",
        path: "/cat_t_stationery/cat_t_books/",
      },
    });
    const pages = await db.attributeDef.create({
      data: { key: "t_pages", label: "Pages", type: "NUMBER" },
    });
    const ruling = await db.attributeDef.create({
      data: {
        key: "t_ruling",
        label: "Ruling",
        type: "ENUM",
        options: {
          create: [
            { value: "single", label: "Single ruled" },
            { value: "square", label: "Square" },
          ],
        },
      },
    });
    await db.categoryAttribute.createMany({
      data: [
        { categoryId: root.id, defId: pages.id, required: true, filterable: true },
        { categoryId: leaf.id, defId: ruling.id, filterable: true },
      ],
    });
    return leaf.id;
  }

  it("checks values against inherited attributes and stores them typed", async () => {
    const categoryId = await stationery();
    await expect(saveProduct(null, { ...base, categoryId }, null)).rejects.toThrow("Pages");
    await expect(
      saveProduct(
        null,
        { ...base, categoryId, "spec.t_pages": "80", "spec.t_ruling": "dots" },
        null,
      ),
    ).rejects.toThrow(CatalogueError);
    const p = await saveProduct(
      null,
      { ...base, categoryId, "spec.t_pages": "80", "spec.t_ruling": "single", "spec.nope": "x" },
      null,
    );
    expect(p.specs).toEqual({ t_pages: 80, t_ruling: "single" });
  });

  it("filters the shop by a spec", async () => {
    const categoryId = await stationery();
    const make = async (pages: string) => {
      const p = await saveProduct(null, { ...base, categoryId, "spec.t_pages": pages }, null);
      await db.variant.create({
        data: { productId: p.id, options: {}, optionKey: "", label: "", available: 3 },
      });
      return p.id;
    };
    const eighty = await make("80");
    await make("120");
    const tree = await loadCategoryTree();
    const { resolveAttributes } = await import("@/lib/categories");
    const found = await listProducts({
      specs: { t_pages: "80" },
      attributes: resolveAttributes(tree, categoryId),
    });
    expect(found.map((p) => p.id)).toEqual([eighty]);
  });
});
