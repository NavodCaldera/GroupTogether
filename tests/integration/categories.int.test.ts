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

const legacy = (id: string, kind: string | null, category: "APPAREL" | "SHOES" = "APPAREL") =>
  db.product.create({
    data: {
      id,
      title: id,
      brand: "Test",
      category,
      kind,
      categoryId: CLOTHING_ROOT_ID,
      stockType: "FACTORY_SURPLUS",
      price: "1000",
      status: "LIVE",
    },
  });

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
      return snapshot(tx);
    });
    expect(migrated).toEqual(seeded);
  });

  it("is safe to write again", async () => {
    await ensureCategoryTree();
    expect(await db.category.count()).toBe((await snapshot(db)).categories.length);
  });

  it("links each product to the leaf for its kind, or to a root", async () => {
    await legacy("shirt", "men-shirts");
    await legacy("dress", "women-dresses");
    await legacy("set", "kid-sets");
    await legacy("plain", null);
    await legacy("odd", "men");
    await legacy("unknown", "boy-shoes", "SHOES");
    await legacy("oldshoe", null, "SHOES");
    const linked = await rolledBack(async (tx) => {
      await tx.$executeRawUnsafe(`ALTER TABLE "Product" ALTER COLUMN "categoryId" DROP NOT NULL`);
      await tx.$executeRawUnsafe(`UPDATE "Product" SET "categoryId" = NULL`);
      const [backfill] = block("backfill");
      await tx.$executeRawUnsafe(backfill);
      return tx.product.findMany({ select: { id: true, categoryId: true } });
    });
    expect(Object.fromEntries(linked.map((p) => [p.id, p.categoryId]))).toEqual({
      shirt: "cat_clothing_men_shirts",
      dress: "cat_clothing_women_dresses",
      set: "cat_clothing_kid_sets",
      plain: CLOTHING_ROOT_ID,
      odd: CLOTHING_ROOT_ID,
      unknown: "cat_shoes",
      oldshoe: "cat_shoes",
    });
  });
});

describe("saving a product's category", () => {
  const base = { title: "Tree shirt", brand: "Test", price: "1400" };

  it("stores the chosen leaf and still writes the old columns", async () => {
    const id = categoryIdOf(kindSlug("women-dresses"));
    const p = await saveProduct(null, { ...base, categoryId: id }, null);
    expect(p).toMatchObject({
      categoryId: id,
      audience: "WOMEN",
      kind: "women-dresses",
      category: "APPAREL",
      specs: {},
    });
    const moved = await saveProduct(p.id, { ...base, categoryId: "cat_shoes" }, null);
    expect(moved).toMatchObject({
      categoryId: "cat_shoes",
      audience: null,
      kind: null,
      category: "SHOES",
    });
  });

  it("maps an older audience and kind to the tree", async () => {
    const p = await saveProduct(null, { ...base, audience: "MEN", kind: "men-shirts" }, null);
    expect(p.categoryId).toBe("cat_clothing_men_shirts");
  });

  it("refuses a missing, parent, inactive or mismatched category", async () => {
    await expect(saveProduct(null, base, null)).rejects.toThrow("Choose a category");
    for (const categoryId of [CLOTHING_ROOT_ID, "cat_clothing_men", "nope"])
      await expect(saveProduct(null, { ...base, categoryId }, null)).rejects.toThrow(
        CatalogueError,
      );
    await db.category.update({ where: { id: "cat_clothing_men" }, data: { active: false } });
    await expect(
      saveProduct(null, { ...base, categoryId: "cat_clothing_men_shirts" }, null),
    ).rejects.toThrow("Choose a category");
    await expect(
      saveProduct(null, { ...base, categoryId: "cat_clothing_kid_sets", audience: "MEN" }, null),
    ).rejects.toThrow("isn't offered");
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
    expect(dresses?.sizes).toContain("M");
  });
});
