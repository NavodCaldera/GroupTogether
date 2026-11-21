/**
 * The category tree (DEC-029, CATG-001): the clothing tree built from the kinds in taxonomy.ts,
 * path helpers and the resolvers for what a category inherits from its ancestors. No database:
 * src/server/categories.ts loads the tree and writes the seed rows.
 */
import { ALL_SIZES, AUDIENCES, type Audience, KINDS, isAudience } from "./taxonomy";

export const FEATURES = ["fit", "materials", "audience"] as const;
export type Feature = (typeof FEATURES)[number];

export type AttributeTypeName = "TEXT" | "NUMBER" | "ENUM" | "BOOL";

/** A category as the resolvers need it. Money stays a string (Decimal at the edges). */
export type CategoryNode = {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  path: string;
  sortOrder: number;
  active: boolean;
  commissionPct: string | null;
  minCommission: string | null;
  features: string[];
  needsApproval: boolean;
  returnReasons: string[];
  attributes: CategoryAttributeNode[];
};

export type CategoryAttributeNode = {
  key: string;
  label: string;
  type: AttributeTypeName;
  unit: string | null;
  options: { value: string; label: string }[];
  required: boolean;
  isVariantAxis: boolean;
  filterable: boolean;
  sortOrder: number;
};

/** An attribute as a form or filter field; `values` lists the choices (empty for free input). */
export type ChoiceAttribute = {
  key: string;
  label: string;
  type: AttributeTypeName;
  unit: string | null;
  required: boolean;
  isVariantAxis: boolean;
  filterable: boolean;
  values: { value: string; label: string }[];
};

/** A choosable category for a select: `value` is an id (forms) or a slug (shop URLs). */
export type CategoryChoice = { value: string; label: string; attributes: ChoiceAttribute[] };
export type CategoryGroup = { label: string; options: CategoryChoice[] };

// ─── The seeded clothing tree ─────────────────────────────────────────────

export const CLOTHING_SLUG = "clothing";
export const SHOES_SLUG = "shoes";

/** Seeded rows use ids made from their slug, so the migration and the seed write the same tree. */
export const categoryIdOf = (slug: string) => `cat_${slug.replace(/[^a-z0-9]+/g, "_")}`;
export const CLOTHING_ROOT_ID = categoryIdOf(CLOTHING_SLUG);

export type CategorySeed = {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  path: string;
  sortOrder: number;
  features: string[];
};

export type AttributeSeed = {
  id: string;
  key: string;
  label: string;
  type: AttributeTypeName;
  options: { id: string; value: string; label: string; sortOrder: number }[];
};

export type CategoryAttributeSeed = {
  categoryId: string;
  defId: string;
  required: boolean;
  isVariantAxis: boolean;
  filterable: boolean;
  sortOrder: number;
};

const CLOTHING_FEATURES: Feature[] = ["fit", "materials", "audience"];

/** "men-tshirts" → "clothing/men/tshirts". */
export function kindSlug(kind: string) {
  const i = kind.indexOf("-");
  return i > 0 ? `${CLOTHING_SLUG}/${kind.slice(0, i)}/${kind.slice(i + 1)}` : CLOTHING_SLUG;
}

/** The audience a clothing category belongs to ("clothing/women/…" → WOMEN), if any. */
export function audienceOfSlug(slug: string): Audience | null {
  const [root, part] = slug.split("/");
  const a = part?.toUpperCase();
  return root === CLOTHING_SLUG && isAudience(a) ? a : null;
}

/** The taxonomy kind of a clothing leaf ("clothing/men/tshirts" → "men-tshirts"), if any. */
export function kindOfSlug(slug: string): string | null {
  const [root, part, leaf, ...rest] = slug.split("/");
  if (root !== CLOTHING_SLUG || !part || !leaf || rest.length) return null;
  const a = part.toUpperCase();
  if (!isAudience(a)) return null;
  const id = `${part}-${leaf}`;
  return KINDS[a].some((k) => k.id === id) ? id : null;
}

/**
 * Paths of the clothing audience nodes other than `audience` ("/cat_clothing/cat_clothing_men/"),
 * for the shop: a buyer sees their own audience and everything outside them (unisex, DEC-025).
 */
export function otherAudiencePaths(audience: Audience): string[] {
  const root = childPath(null, CLOTHING_ROOT_ID);
  return AUDIENCES.filter((a) => a.id !== audience).map((a) =>
    childPath(root, categoryIdOf(`${CLOTHING_SLUG}/${a.id.toLowerCase()}`)),
  );
}

/** "/a/b/" from the parent's path. */
export const childPath = (parentPath: string | null, id: string) => `${parentPath ?? "/"}${id}/`;

/** The tree every database starts with: Clothing > audience > kind, and an empty Shoes root. */
export function seedCategories(): CategorySeed[] {
  const rows: CategorySeed[] = [];
  const add = (parent: CategorySeed | null, slug: string, name: string, sortOrder: number) => {
    const id = categoryIdOf(slug);
    const row: CategorySeed = {
      id,
      parentId: parent?.id ?? null,
      slug,
      name,
      path: childPath(parent?.path ?? null, id),
      sortOrder,
      features: parent ? [] : CLOTHING_FEATURES,
    };
    rows.push(row);
    return row;
  };
  const clothing = add(null, CLOTHING_SLUG, "Clothing", 0);
  AUDIENCES.forEach((a, i) => {
    const node = add(clothing, `${CLOTHING_SLUG}/${a.id.toLowerCase()}`, a.label, i);
    KINDS[a.id].forEach((k, j) => add(node, kindSlug(k.id), k.label, j));
  });
  add(null, SHOES_SLUG, "Shoes", 1);
  return rows;
}

export function seedAttributes(): AttributeSeed[] {
  return [
    {
      id: "attr_size",
      key: "size",
      label: "Size",
      type: "ENUM",
      options: ALL_SIZES.map((s, i) => ({
        id: `attr_size_${s.toLowerCase()}`,
        value: s,
        label: s,
        sortOrder: i,
      })),
    },
    { id: "attr_colour", key: "colour", label: "Colour", type: "TEXT", options: [] },
  ];
}

export function seedCategoryAttributes(): CategoryAttributeSeed[] {
  const base = { categoryId: CLOTHING_ROOT_ID, isVariantAxis: true, filterable: true };
  return [
    { ...base, defId: "attr_size", required: true, sortOrder: 0 },
    { ...base, defId: "attr_colour", required: false, sortOrder: 1 },
  ];
}

// ─── Tree helpers and resolvers ───────────────────────────────────────────

export type Tree = ReadonlyMap<string, CategoryNode>;

export const toTree = (nodes: CategoryNode[]): Tree => new Map(nodes.map((n) => [n.id, n]));

/** Root first, ending with the category itself; empty when the id is unknown. */
export function ancestors(tree: Tree, id: string): CategoryNode[] {
  const out: CategoryNode[] = [];
  const seen = new Set<string>();
  for (
    let n = tree.get(id);
    n && !seen.has(n.id);
    n = n.parentId ? tree.get(n.parentId) : undefined
  ) {
    seen.add(n.id);
    out.unshift(n);
  }
  return out;
}

/** Is `id` the category `rootId` or below it? */
export function inSubtree(tree: Tree, id: string, rootId: string) {
  const node = tree.get(id);
  const root = tree.get(rootId);
  return !!node && !!root && node.path.startsWith(root.path);
}

/** Children in display order (sortOrder, then name). Null parent lists the roots. */
export function childrenOf(tree: Tree, parentId: string | null, { activeOnly = true } = {}) {
  return [...tree.values()]
    .filter((n) => n.parentId === parentId && (!activeOnly || n.active))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** The category's ids and every id below it. */
export function subtreeIds(tree: Tree, id: string) {
  const root = tree.get(id);
  if (!root) return [];
  return [...tree.values()].filter((n) => n.path.startsWith(root.path)).map((n) => n.id);
}

/** Is the category and every ancestor active? */
export const isActive = (tree: Tree, id: string) => {
  const chain = ancestors(tree, id);
  return chain.length > 0 && chain.every((n) => n.active);
};

/** Features switched on here or above. */
export function resolveFeatures(tree: Tree, id: string): string[] {
  return [...new Set(ancestors(tree, id).flatMap((n) => n.features))];
}

export const hasFeature = (tree: Tree, id: string, feature: Feature) =>
  resolveFeatures(tree, id).includes(feature);

/** Return reasons added here or above. */
export function resolveReturnReasons(tree: Tree, id: string): string[] {
  return [...new Set(ancestors(tree, id).flatMap((n) => n.returnReasons))];
}

/** Restricted when the category or any ancestor needs approval. */
export const resolveNeedsApproval = (tree: Tree, id: string) =>
  ancestors(tree, id).some((n) => n.needsApproval);

/** The nearest set commission percentage and minimum, each inherited separately. */
export function resolveCommission(tree: Tree, id: string) {
  const chain = ancestors(tree, id).reverse();
  return {
    pct: chain.find((n) => n.commissionPct !== null)?.commissionPct ?? null,
    min: chain.find((n) => n.minCommission !== null)?.minCommission ?? null,
  };
}

/**
 * Attributes from the root down. A child adds attributes and may change an inherited one's flags
 * (the nearest wins), but never removes one.
 */
export function resolveAttributes(tree: Tree, id: string): CategoryAttributeNode[] {
  const byKey = new Map<string, { a: CategoryAttributeNode; depth: number }>();
  ancestors(tree, id).forEach((n, depth) => {
    for (const a of n.attributes) byKey.set(a.key, { a, depth: byKey.get(a.key)?.depth ?? depth });
  });
  return [...byKey.values()]
    .sort((x, y) => x.depth - y.depth || x.a.sortOrder - y.a.sortOrder)
    .map((x) => x.a);
}

/** "Clothing › Men › Shirts". */
export const categoryLabel = (tree: Tree, id: string) =>
  ancestors(tree, id)
    .map((n) => n.name)
    .join(" › ");

/** Active leaves in tree order, each with its ancestors' names for grouping. */
export function leaves(tree: Tree, { audience }: { audience?: Audience | null } = {}) {
  const out: { node: CategoryNode; group: string }[] = [];
  const walk = (parentId: string | null, trail: string[]) => {
    for (const n of childrenOf(tree, parentId)) {
      const a = audienceOfSlug(n.slug);
      if (audience && a && a !== audience) continue;
      const kids = childrenOf(tree, n.id);
      if (kids.length) walk(n.id, [...trail, n.name]);
      else out.push({ node: n, group: trail.join(" › ") });
    }
  };
  walk(null, []);
  return out;
}
