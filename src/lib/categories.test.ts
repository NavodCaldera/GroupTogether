import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLOTHING_ROOT_ID,
  type CategoryNode,
  ancestors,
  audienceOfSlug,
  categoryIdOf,
  categoryLabel,
  childrenOf,
  hasFeature,
  inSubtree,
  isActive,
  kindOfSlug,
  kindSlug,
  leaves,
  otherAudiencePaths,
  resolveAttributes,
  resolveCommission,
  resolveFeatures,
  resolveNeedsApproval,
  resolveReturnReasons,
  seedAttributes,
  seedCategories,
  seedCategoryAttributes,
  subtreeIds,
  toTree,
} from "./categories";
import { KINDS } from "./taxonomy";

const attr = (key: string, over: Partial<CategoryNode["attributes"][number]> = {}) => ({
  key,
  label: key,
  type: "TEXT" as const,
  unit: null,
  options: [],
  required: false,
  isVariantAxis: false,
  filterable: false,
  sortOrder: 0,
  ...over,
});

const node = (over: Partial<CategoryNode> & { id: string }): CategoryNode => ({
  parentId: null,
  slug: over.id,
  name: over.id,
  path: `/${over.id}/`,
  sortOrder: 0,
  active: true,
  commissionPct: null,
  minCommission: null,
  features: [],
  needsApproval: false,
  returnReasons: [],
  attributes: [],
  ...over,
});

// stationery > books > exercise
const tree = toTree([
  node({
    id: "s",
    slug: "stationery",
    commissionPct: "8.00",
    minCommission: "10.00",
    returnReasons: ["DAMAGED"],
    attributes: [attr("brand_line", { sortOrder: 1 }), attr("pages", { sortOrder: 0 })],
  }),
  node({
    id: "b",
    parentId: "s",
    slug: "stationery/books",
    path: "/s/b/",
    commissionPct: "6.50",
    features: ["x"],
    attributes: [attr("ruling"), attr("pages", { required: true, isVariantAxis: true })],
  }),
  node({
    id: "e",
    parentId: "b",
    slug: "stationery/books/exercise",
    path: "/s/b/e/",
    needsApproval: true,
    returnReasons: ["MISSING_PARTS", "DAMAGED"],
    sortOrder: 1,
  }),
  node({ id: "n", parentId: "b", slug: "stationery/books/notes", path: "/s/b/n/", active: false }),
]);

describe("category resolvers", () => {
  it("walks ancestors root first", () => {
    expect(ancestors(tree, "e").map((n) => n.id)).toEqual(["s", "b", "e"]);
    expect(ancestors(tree, "missing")).toEqual([]);
    expect(categoryLabel(tree, "e")).toBe("s › b › e");
  });

  it("finds subtrees by path", () => {
    expect(inSubtree(tree, "e", "s")).toBe(true);
    expect(inSubtree(tree, "s", "e")).toBe(false);
    expect(subtreeIds(tree, "b").sort()).toEqual(["b", "e", "n"]);
    expect(childrenOf(tree, "b").map((n) => n.id)).toEqual(["e"]);
    expect(childrenOf(tree, "b", { activeOnly: false }).map((n) => n.id)).toEqual(["n", "e"]);
  });

  it("is inactive when any ancestor is", () => {
    expect(isActive(tree, "e")).toBe(true);
    expect(isActive(tree, "n")).toBe(false);
  });

  it("inherits commission percentage and minimum separately", () => {
    expect(resolveCommission(tree, "e")).toEqual({ pct: "6.50", min: "10.00" });
    expect(resolveCommission(tree, "s")).toEqual({ pct: "8.00", min: "10.00" });
  });

  it("adds features, reasons and approval down the tree", () => {
    expect(resolveFeatures(tree, "e")).toEqual(["x"]);
    expect(resolveFeatures(tree, "s")).toEqual([]);
    expect(resolveReturnReasons(tree, "e")).toEqual(["DAMAGED", "MISSING_PARTS"]);
    expect(resolveNeedsApproval(tree, "e")).toBe(true);
    expect(resolveNeedsApproval(tree, "b")).toBe(false);
  });

  it("merges attributes: children add and override flags, never remove", () => {
    const resolved = resolveAttributes(tree, "e");
    expect(resolved.map((a) => a.key)).toEqual(["pages", "brand_line", "ruling"]);
    expect(resolved.find((a) => a.key === "pages")).toMatchObject({
      required: true,
      isVariantAxis: true,
    });
    expect(resolveAttributes(tree, "s").find((a) => a.key === "pages")?.required).toBe(false);
  });

  it("lists active leaves with their group", () => {
    expect(leaves(tree).map((l) => [l.node.id, l.group])).toEqual([["e", "s › b"]]);
  });
});

describe("seeded clothing tree", () => {
  const rows = seedCategories();

  it("has a Clothing root, audiences, every kind and an empty Shoes root", () => {
    const kinds = Object.values(KINDS).flat();
    expect(rows).toHaveLength(1 + 5 + kinds.length + 1);
    for (const k of kinds) {
      const row = rows.find((r) => r.slug === kindSlug(k.id))!;
      expect(row.name).toBe(k.label);
      expect(kindOfSlug(row.slug)).toBe(k.id);
    }
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    const shoes = rows.find((r) => r.slug === "shoes")!;
    expect(shoes.parentId).toBeNull();
    expect(rows.some((r) => r.parentId === shoes.id)).toBe(false);
  });

  it("puts the clothing add-ons on both roots, inherited below", () => {
    const t = toTree(rows.map((r) => node({ ...r, attributes: [] })));
    for (const root of rows.filter((r) => !r.parentId))
      expect(root.features).toEqual(["fit", "materials", "audience"]);
    expect(hasFeature(t, categoryIdOf(kindSlug("girl-dresses")), "fit")).toBe(true);
    expect(rows.filter((r) => r.parentId).every((r) => r.features.length === 0)).toBe(true);
  });

  it("builds paths from ids", () => {
    const shirts = rows.find((r) => r.slug === "clothing/men/shirts")!;
    expect(shirts.path).toBe(`/${CLOTHING_ROOT_ID}/cat_clothing_men/cat_clothing_men_shirts/`);
    expect(shirts.id).toBe("cat_clothing_men_shirts");
  });

  it("makes size and colour variant axes on the Clothing root", () => {
    expect(seedCategoryAttributes()).toEqual([
      expect.objectContaining({
        categoryId: CLOTHING_ROOT_ID,
        defId: "attr_size",
        isVariantAxis: true,
      }),
      expect.objectContaining({
        categoryId: CLOTHING_ROOT_ID,
        defId: "attr_colour",
        isVariantAxis: true,
      }),
    ]);
    const size = seedAttributes().find((a) => a.key === "size")!;
    for (const k of Object.values(KINDS).flat())
      for (const s of k.sizes) expect(size.options.map((o) => o.value)).toContain(s);
  });

  it("matches the rows the category_tree migration inserts", () => {
    const sql = readFileSync(
      "prisma/migrations/20261123100000_category_tree/migration.sql",
      "utf8",
    );
    const block = sql.slice(sql.indexOf("-- tree:start"), sql.indexOf("-- tree:end"));
    const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
    for (const r of rows)
      expect(block).toContain(
        `(${q(r.id)}, ${r.parentId ? q(r.parentId) : "NULL"}, ${q(r.slug)}, ${q(r.name)}, ${q(r.path)}, ${r.sortOrder},`,
      );
    expect(block.match(/'cat_[a-z_]+', (NULL|'cat_[a-z_]+'), '/g)).toHaveLength(rows.length);
    for (const a of seedAttributes()) {
      expect(block).toContain(`(${q(a.id)}, ${q(a.key)}, ${q(a.label)}, '${a.type}')`);
      for (const o of a.options) expect(block).toContain(`(${q(o.id)}, ${q(a.id)}, ${q(o.value)},`);
    }
  });
});

describe("slugs and old columns", () => {
  it("maps kinds and audiences", () => {
    expect(kindSlug("men-tshirts")).toBe("clothing/men/tshirts");
    expect(kindOfSlug("clothing/men/tshirts")).toBe("men-tshirts");
    expect(kindOfSlug("clothing/men")).toBeNull();
    expect(kindOfSlug("clothing/men/nothing")).toBeNull();
    expect(kindOfSlug("stationery/books/exercise")).toBeNull();
    expect(audienceOfSlug("clothing/women/dresses")).toBe("WOMEN");
    expect(audienceOfSlug("stationery/women")).toBeNull();
  });

  it("lists the other audiences' paths for the shop", () => {
    const paths = otherAudiencePaths("WOMEN");
    expect(paths).toHaveLength(4);
    expect(paths).toContain("/cat_clothing/cat_clothing_men/");
    expect(paths).not.toContain("/cat_clothing/cat_clothing_women/");
    const tree = seedCategories();
    const dresses = tree.find((c) => c.slug === "clothing/women/dresses")!;
    expect(paths.some((p) => dresses.path.startsWith(p))).toBe(false);
    const shirts = tree.find((c) => c.slug === "clothing/men/shirts")!;
    expect(paths.some((p) => shirts.path.startsWith(p))).toBe(true);
  });
});
