import "server-only";
import { cache } from "react";
import {
  type CategoryGroup,
  type CategoryNode,
  type Tree,
  kindOfSlug,
  leaves,
  resolveAttributes,
  seedAttributes,
  seedCategories,
  seedCategoryAttributes,
  toTree,
} from "@/lib/categories";
import { type Audience, sizesFor } from "@/lib/taxonomy";
import { db, type Tx } from "./db";

async function readTree(client: Tx = db): Promise<CategoryNode[]> {
  const rows = await client.category.findMany({
    include: {
      attributes: { include: { def: { include: { options: { orderBy: { sortOrder: "asc" } } } } } },
    },
    orderBy: [{ path: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    slug: r.slug,
    name: r.name,
    path: r.path,
    sortOrder: r.sortOrder,
    active: r.active,
    commissionPct: r.commissionPct?.toString() ?? null,
    minCommission: r.minCommission?.toString() ?? null,
    features: r.features,
    needsApproval: r.needsApproval,
    returnReasons: r.returnReasons,
    attributes: r.attributes.map((a) => ({
      key: a.def.key,
      label: a.def.label,
      type: a.def.type,
      unit: a.def.unit,
      options: a.def.options.map((o) => ({ value: o.value, label: o.label })),
      required: a.required,
      isVariantAxis: a.isVariantAxis,
      filterable: a.filterable,
      sortOrder: a.sortOrder,
    })),
  }));
}

/** The whole category tree, read once per request. */
export const loadCategoryTree = cache(async (): Promise<Tree> => toTree(await readTree()));

/** Sizes to offer for a category: its kind's sizes for clothing, else the size attribute's options. */
function sizesOf(tree: Tree, node: CategoryNode) {
  const kind = kindOfSlug(node.slug);
  if (kind) return sizesFor(kind);
  return (
    resolveAttributes(tree, node.id)
      .find((a) => a.key === "size")
      ?.options.map((o) => o.value) ?? []
  );
}

/**
 * Leaf categories grouped under their parents, for a select. The shop passes the buyer's audience
 * so other audiences' clothing is left out; `by` picks the value (ids for forms, slugs for URLs).
 */
export async function categoryChoices({
  audience,
  by = "id",
}: { audience?: Audience | null; by?: "id" | "slug" } = {}): Promise<CategoryGroup[]> {
  const tree = await loadCategoryTree();
  const groups: CategoryGroup[] = [];
  for (const { node, group } of leaves(tree, { audience })) {
    let g = groups.find((x) => x.label === group);
    if (!g) groups.push((g = { label: group, options: [] }));
    g.options.push({
      value: by === "id" ? node.id : node.slug,
      label: node.name,
      sizes: sizesOf(tree, node),
    });
  }
  return groups;
}

/**
 * Writes the starting tree (the same rows as the category_tree migration). Upserts by id and never
 * deletes, so it is safe on a database that already has the tree. Used by the seed and test reset.
 */
export async function ensureCategoryTree(client: Tx = db) {
  for (const c of seedCategories()) {
    const { id, ...rest } = c;
    await client.category.upsert({ where: { id }, create: c, update: rest });
  }
  for (const a of seedAttributes()) {
    const { options, ...def } = a;
    await client.attributeDef.upsert({ where: { id: def.id }, create: def, update: def });
    for (const o of options)
      await client.attributeOption.upsert({
        where: { id: o.id },
        create: { ...o, defId: def.id },
        update: { ...o, defId: def.id },
      });
  }
  for (const ca of seedCategoryAttributes()) {
    const { categoryId, defId, ...flags } = ca;
    await client.categoryAttribute.upsert({
      where: { categoryId_defId: { categoryId, defId } },
      create: ca,
      update: flags,
    });
  }
}
