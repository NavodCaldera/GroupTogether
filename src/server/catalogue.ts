import "server-only";
import { lockUserAdvisory } from "./orders/locks";
import { coversCategory } from "./factory-categories";
import { z } from "zod";
import type { Condition, Prisma } from "@/generated/prisma/client";
import type { Audience } from "@/lib/taxonomy";
import {
  type CategoryAttributeNode,
  childrenOf,
  isActive,
  kindOfSlug,
  kindSlug,
  otherAudiencePaths,
  resolveAttributes,
  resolveCommission,
} from "@/lib/categories";
import { SpecsError, parseSpecs, specFilterValue } from "@/lib/product-specs";
import { loadCategoryTree } from "./categories";
import { D, toD } from "@/lib/decimal";
import { linkOnSite } from "@/lib/brand-rules";
import { db } from "./db";
import { canSell, canSellIn, sellingFactoryWhere } from "./agreements";
import { buyerPrice, categoryCommission } from "@/lib/price-rules";
import { getSettings } from "./settings";
import { sizeOrder } from "@/lib/fit/data";
import {
  type VariantOptions,
  VariantOptionsError,
  compareOptionValues,
  readOptions,
  sizeOf,
  variantFields,
} from "@/lib/variant-options";
import { IMAGE_TYPES, checkUpload, saveUpload } from "./storage";

export class CatalogueError extends Error {}

export type ProductFilters = {
  /** The buyer's own audience; products with no audience (unisex) show to everyone. */
  audience?: Audience;
  /** A category's materialised path: the category and everything below it (DEC-029) */
  categoryPath?: string;
  condition?: Condition;
  brand?: string;
  /** Variant options the buyer picked, e.g. {size: "M"}; one in-stock variant must match all */
  options?: Record<string, string>;
  /** Product-level attribute filters, typed by `attributes` */
  specs?: Record<string, string>;
  /** The category's resolved attributes, used to type `specs` */
  attributes?: CategoryAttributeNode[];
  q?: string;
};

const listSelect = {
  id: true,
  title: true,
  brand: true,
  categoryRef: { select: { slug: true } },
  condition: true,
  price: true,
  retailPrice: true,
  photoKey: true,
  sellerId: true,
  seller: { select: { name: true, company: true } },
  variants: { select: { available: true } },
} satisfies Prisma.ProductSelect;

/**
 * A product is in the shop while it has free stock in some size (product owner, 2026-10-20) and
 * an admin hasn't hidden it (ARCHIVED, 2026-11-03). New, emptied and sold-out products are hidden.
 */
export const IN_SHOP = {
  hiddenAt: null,
  variants: { some: { available: { gt: 0 } } },
  // Admins can hide any listing, including one a factory published itself (2026-11-03).
  status: { not: "ARCHIVED" },
  AND: [{ OR: [{ sellerId: null }, { seller: { isBrand: false } }] }],
} satisfies Prisma.ProductWhereInput;

async function shopEligibility(now: Date) {
  return {
    OR: [{ sellerId: null }, { seller: { is: await sellingFactoryWhere(now) } }],
  } satisfies Prisma.ProductWhereInput;
}

/**
 * Products in the shop. Sizes with no free stock are still listed but marked sold out.
 * "saving" ranks by how far below retail the price is; products without a retail price above ours
 * fill any remaining places cheapest first.
 */
export async function listProducts(
  f: ProductFilters = {},
  take = 60,
  order: "newest" | "cheapest" | "saving" = "newest",
  now = new Date(),
) {
  if (order === "saving") {
    const all = await findShopProducts(f, undefined, "cheapest", now);
    const ratio = (p: (typeof all)[number]) =>
      p.retailPrice && toD(p.retailPrice).gt(toD(p.price))
        ? toD(p.retailPrice).minus(toD(p.price)).div(toD(p.retailPrice))
        : null;
    const ranked = all
      .map((p) => ({ p, r: ratio(p) }))
      .filter((x) => x.r !== null)
      .sort((a, b) => b.r!.comparedTo(a.r!))
      .map((x) => x.p);
    const rest = all.filter((p) => ratio(p) === null);
    return [...ranked, ...rest].slice(0, take);
  }
  return findShopProducts(f, take, order, now);
}

async function findShopProducts(
  f: ProductFilters,
  take: number | undefined,
  order: "newest" | "cheapest",
  now: Date,
) {
  return db.product.findMany({
    where: {
      ...IN_SHOP,
      AND: [
        ...IN_SHOP.AND,
        await shopEligibility(now),
        // Audience from the category tree: other audiences' clothing is left out (DEC-025).
        ...(f.audience
          ? otherAudiencePaths(f.audience).map((path) => ({
              NOT: { categoryRef: { path: { startsWith: path } } },
            }))
          : []),
        ...specWhere(f),
      ],
      categoryRef: f.categoryPath ? { path: { startsWith: f.categoryPath } } : undefined,
      condition: f.condition,
      brand: f.brand ? { equals: f.brand, mode: "insensitive" } : undefined,
      variants: optionsWhere(f.options),
      OR: f.q
        ? [
            { title: { contains: f.q, mode: "insensitive" } },
            { brand: { contains: f.q, mode: "insensitive" } },
          ]
        : undefined,
    },
    select: listSelect,
    orderBy:
      order === "cheapest" ? [{ price: "asc" }, { createdAt: "desc" }] : { createdAt: "desc" },
    take,
  });
}

/** One in-stock variant matching every picked option (Variant.options). */
function optionsWhere(options: Record<string, string> | undefined) {
  const picked = Object.entries(options ?? {}).filter(([, v]) => v);
  if (!picked.length) return IN_SHOP.variants;
  return {
    some: {
      available: { gt: 0 },
      AND: picked.map(([k, v]) => ({ options: { path: [k], equals: v } })),
    },
  } satisfies Prisma.VariantListRelationFilter;
}

/** Product.specs filters, each value typed by its attribute. */
function specWhere(f: ProductFilters): Prisma.ProductWhereInput[] {
  const out: Prisma.ProductWhereInput[] = [];
  for (const [k, raw] of Object.entries(f.specs ?? {})) {
    const attr = f.attributes?.find((a) => a.key === k && !a.isVariantAxis);
    const value = attr ? specFilterValue(attr, raw) : undefined;
    if (value !== undefined) out.push({ specs: { path: [k], equals: value } });
  }
  return out;
}

/** A few products in the shop matching what the shopper has typed, for the search dropdown. */
export async function suggestProducts(q: string, take = 6, now = new Date()) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const rows = await db.product.findMany({
    where: {
      ...IN_SHOP,
      AND: [...IN_SHOP.AND, await shopEligibility(now)],
      OR: [
        { title: { contains: term, mode: "insensitive" } },
        { brand: { contains: term, mode: "insensitive" } },
      ],
    },
    select: { id: true, title: true, brand: true, price: true },
    orderBy: { title: "asc" },
    take: 20,
  });
  const lower = term.toLowerCase();
  const starts = (t: string) => (t.toLowerCase().startsWith(lower) ? 0 : 1);
  return rows.sort((a, b) => starts(a.title) - starts(b.title)).slice(0, take);
}

export async function shopFacets(now = new Date()) {
  const eligibility = await shopEligibility(now);
  const [brands, variants] = await Promise.all([
    db.product.findMany({
      where: { ...IN_SHOP, AND: [...IN_SHOP.AND, eligibility] },
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    }),
    db.variant.findMany({
      where: { available: { gt: 0 }, product: { ...IN_SHOP, AND: [...IN_SHOP.AND, eligibility] } },
      distinct: ["optionKey"],
      select: { options: true },
    }),
  ]);
  // Values per option name from Variant.options, e.g. {size: ["L", "M"], colour: ["Navy"]}.
  const values = new Map<string, Set<string>>();
  for (const v of variants)
    for (const [k, value] of Object.entries(readOptions(v.options))) {
      if (!values.has(k)) values.set(k, new Set());
      values.get(k)!.add(value);
    }
  const options: Record<string, string[]> = Object.fromEntries(
    [...values].map(([k, set]) => [k, [...set].sort((a, b) => compareOptionValues(k, a, b))]),
  );
  return { brands: brands.map((b) => b.brand), sizes: options.size ?? [], options };
}

/** One product with its sizes. Opens even when sold out, so links from carts keep working. */
export async function getProduct(id: string, now = new Date()) {
  const product = await db.product.findFirst({
    where: {
      id,
      hiddenAt: null,
      status: { not: "ARCHIVED" },
      AND: [...IN_SHOP.AND, await shopEligibility(now)],
    },
    include: {
      variants: { orderBy: { label: "asc" } },
      seller: { select: { name: true, company: true } },
      categoryRef: { select: { slug: true } },
    },
  });
  if (!product) return null;
  // The clothing kind comes from the category (DEC-029); null outside clothing.
  const kind = kindOfSlug(product.categoryRef.slug);
  // Sizes small to large (S, M, L, XL), not alphabetical; other options stay in label order.
  const order = sizeOrder(
    kind,
    product.variants.map((v) => sizeOf(v.options)),
  );
  product.variants.sort(
    (x, y) => order.indexOf(sizeOf(x.options)) - order.indexOf(sizeOf(y.options)),
  );
  return { ...product, kind };
}

// ─── Admin ────────────────────────────────────────────────────────────────

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount such as 4500 or 4500.50");

/** An optional whole number from a form field ("" leaves it unset). */
function wholeField(min: number, max: number) {
  return z
    .string()
    .trim()
    .regex(/^\d*$/, "Enter a whole number")
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((n) => n === undefined || (n >= min && n <= max), {
      message: `Enter a whole number from ${min} to ${max}`,
    });
}

const productSchema = z
  .object({
    title: z.string().trim().min(2, "Enter a title").max(120),
    brand: z.string().trim().min(1, "Enter the brand").max(60),
    description: z.string().trim().max(2000).default(""),
    // The form sends a category from the tree; older callers send a clothing kind.
    categoryId: z.string().trim().max(100).optional().or(z.literal("")),
    kind: z.string().trim().max(60).optional().or(z.literal("")),
    condition: z.enum(["NEW", "FACTORY_SURPLUS", "B_GRADE", "REFURBISHED"]).optional(),
    sellUnit: z.string().trim().max(20).optional().or(z.literal("")),
    minOrderQty: wholeField(1, 10_000),
    stepQty: wholeField(1, 10_000),
    shelfLifeDays: wholeField(0, 36_500),
    hazmat: z
      .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")])
      .optional()
      .transform((v) => (v === undefined ? undefined : v !== "")),
    price: money.optional().or(z.literal("")),
    retailPrice: money.optional().or(z.literal("")),
    // A luxury brand's product: its page on the brand's website showing the actual price.
    brandUrl: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((v) => !v.brandUrl || linkOnSite(v.brandUrl, null), {
    message: "Enter the full link to the brand's page (https://…)",
    path: ["brandUrl"],
  })
  .refine((v) => !v.brandUrl || v.retailPrice, {
    message: "Enter the actual price shown on the brand's page",
    path: ["retailPrice"],
  })
  .refine((v) => v.categoryId || v.kind, {
    message: "Choose a category",
    path: ["categoryId"],
  })
  .refine((v) => v.price, {
    message: "Enter the price",
    path: ["price"],
  });

/**
 * The tree category a listing goes in and its resolved attributes. Only an active category with
 * nothing below it can hold products.
 */
async function categoryFor(v: { categoryId?: string; kind?: string }) {
  const tree = await loadCategoryTree();
  const slug = v.categoryId ? undefined : v.kind ? kindSlug(v.kind) : undefined;
  const node = v.categoryId
    ? tree.get(v.categoryId)
    : [...tree.values()].find((n) => n.slug === slug);
  if (!node || !isActive(tree, node.id) || childrenOf(tree, node.id).length > 0)
    throw new CatalogueError("Choose a category");
  return {
    categoryId: node.id,
    attributes: resolveAttributes(tree, node.id),
    rate: resolveCommission(tree, node.id),
  };
}

/** `spec.<key>` form fields as raw values. */
function specInput(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>))
    if (k.startsWith("spec.") && typeof v === "string") out[k.slice(5)] = v;
  return out;
}

/**
 * Creates or updates a product. It shows in the shop once it has free stock. A factory (`sellerId`)
 * publishes its own listings straight to the shop, with no review (product owner, 2026-11-03),
 * and edits only its own.
 */
export async function saveProduct(
  id: string | null,
  input: unknown,
  photo: File | null,
  { sellerId }: { sellerId?: string } = {},
) {
  if (id && (await db.product.count({ where: { id, seller: { isBrand: true } } })))
    throw new CatalogueError("Premium brand products are managed in Brand rewards");
  if (sellerId && id && !(await db.product.count({ where: { id, sellerId } })))
    throw new CatalogueError("Product not found");
  const existing = id
    ? await db.product.findUnique({ where: { id }, select: { sellerId: true } })
    : null;
  const ownerId = sellerId ?? existing?.sellerId;
  const stored = id
    ? await db.product.findUnique({ where: { id }, select: { specs: true } })
    : null;
  if (ownerId && !(await canSell(ownerId)))
    throw new CatalogueError("Accept the current factory agreement before listing products");
  const parsed = productSchema.parse(input);
  // Factories set their own price; brand links are ours.
  const {
    price,
    categoryId: _categoryId,
    kind: _kind,
    sellUnit,
    ...p
  } = sellerId ? { ...parsed, brandUrl: "" } : parsed;
  const { categoryId, attributes, rate } = await categoryFor(parsed);
  // Product-level values checked against the category's attributes (CATG-002). Stored keys the
  // category no longer has are kept: category edits never rewrite stored specs.
  let specs: Prisma.InputJsonObject;
  try {
    specs = parseSpecs(attributes, specInput(input), stored?.specs);
  } catch (e) {
    if (e instanceof SpecsError) throw new CatalogueError(e.message);
    throw e;
  }
  const data = {
    ...p,
    categoryId,
    specs,
    ...(sellUnit ? { sellUnit } : {}),
    shelfLifeDays: p.shelfLifeDays ?? null,
    price: price!,
    retailPrice: p.retailPrice || null,
    brandUrl: p.brandUrl || null,
    ...(photo && photo.size > 0
      ? await (async () => {
          checkUpload(photo, IMAGE_TYPES, "photo");
          const s = await saveUpload(photo, "products", IMAGE_TYPES);
          return { photoKey: s.storageKey, photoType: s.contentType };
        })()
      : {}),
  };
  const factoryListing = !!ownerId;
  if (factoryListing && !id) await getSettings();
  const saved = await db.$transaction(async (tx) => {
    // A new listing cannot slip past removal's metadata-first owner fence.
    if (ownerId) {
      await lockUserAdvisory(tx, ownerId);
      if (!(await canSellIn(tx, ownerId, new Date())))
        throw new CatalogueError("This factory can no longer list products");
    }
    // A factory lists only in its approved categories (CATG-003); admin listings are not limited.
    if (sellerId && !(await coversCategory(tx, sellerId, data.categoryId)))
      throw new CatalogueError("Your factory isn't approved for this category");
    if (id) await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${id} FOR UPDATE`;
    const fresh = id
      ? await tx.product.findUniqueOrThrow({
          where: { id },
          select: { sellerId: true, commission: true },
        })
      : null;
    if (sellerId && fresh && fresh.sellerId !== sellerId)
      throw new CatalogueError("Product not found");
    let pricing = {};
    if (factoryListing) {
      // Share-lock the setting through creation: a concurrent setting change cannot overtake this snapshot.
      if (!id) await tx.$queryRaw`SELECT 1 FROM "Settings" WHERE id = 1 FOR SHARE`;
      const flat = fresh ? null : (await getSettings(tx)).commissionPerPiece;
      try {
        // A new listing snapshots its category commission (DEAL-004); an edit keeps its snapshot.
        const commission = fresh
          ? (fresh.commission?.toString() ?? "0")
          : categoryCommission(price!, rate, flat!).toFixed(2);
        pricing = {
          factoryPrice: price!,
          commission,
          price: buyerPrice(price!, commission).toFixed(2),
        };
      } catch (error) {
        throw new CatalogueError((error as Error).message);
      }
    }
    return id
      ? tx.product.update({ where: { id }, data: { ...data, ...pricing } })
      : tx.product.create({
          data: {
            ...data,
            ...pricing,
            ...(sellerId ? { sellerId, status: "LIVE" as const } : {}),
          },
        });
  });
  return saved;
}

/**
 * Adds (or with a negative number, removes) free stock of one option set (DEC-029). Never touches
 * locked stock. A factory (`sellerId`) changes only its own products.
 */
export async function adjustStock(
  productId: string,
  options: VariantOptions,
  delta: number,
  { sellerId }: { sellerId?: string } = {},
) {
  if (await db.product.count({ where: { id: productId, seller: { isBrand: true } } }))
    throw new CatalogueError("Premium brand products are managed in Brand rewards");
  if (sellerId && !(await db.product.count({ where: { id: productId, sellerId } })))
    throw new CatalogueError("Product not found");
  if (!Number.isInteger(delta) || delta === 0) throw new CatalogueError("Enter a whole number");
  let fields: ReturnType<typeof variantFields>;
  try {
    fields = variantFields(options);
  } catch (e) {
    if (e instanceof VariantOptionsError) throw new CatalogueError(e.message);
    throw e;
  }
  // The stock form posts the category's variant axes (CATG-002).
  const axes = await variantAxesOf(productId);
  const missing = axes.find((a) => a.required && !(a.key in fields.options));
  if (missing) throw new CatalogueError(`Enter the ${missing.label.toLowerCase()}`);
  if (axes.length && Object.keys(fields.options).some((k) => !axes.some((a) => a.key === k)))
    throw new CatalogueError("Choose options from the category");
  for (const a of axes) {
    const v = fields.options[a.key];
    const known = (o: { value: string }) => o.value.toLowerCase() === v?.toLowerCase();
    if (v && a.type === "ENUM" && a.options.length && !a.options.some(known))
      throw new CatalogueError(`Choose a ${a.label.toLowerCase()} from the list`);
  }
  const existing = await db.variant.findUnique({
    where: { productId_optionKey: { productId, optionKey: fields.optionKey } },
  });
  if (!existing) {
    if (delta < 0) throw new CatalogueError("That option has no stock to remove");
    return db.variant.create({ data: { productId, ...fields, available: delta } });
  }
  const r = await db.variant.updateMany({
    where: { id: existing.id, available: { gte: -delta } },
    data: { available: { increment: delta } },
  });
  if (r.count === 0) throw new CatalogueError("Can't remove more than the free stock");
}

/** The variant axes of a product's category (inherited), in display order. */
async function variantAxesOf(productId: string) {
  const p = await db.product.findUnique({ where: { id: productId }, select: { categoryId: true } });
  if (!p) throw new CatalogueError("Product not found");
  return resolveAttributes(await loadCategoryTree(), p.categoryId).filter((a) => a.isVariantAxis);
}

/**
 * How far below retail our live prices are, over products that list a retail price above ours
 * (total saving / total retail, whole percent). Null until at least 3 products qualify.
 */
export async function retailSaving(now = new Date()) {
  const rows = await db.product.findMany({
    where: {
      ...IN_SHOP,
      AND: [...IN_SHOP.AND, await shopEligibility(now)],
      retailPrice: { not: null },
    },
    select: { price: true, retailPrice: true },
  });
  let retail = new D(0);
  let ours = new D(0);
  let n = 0;
  for (const r of rows) {
    const rp = toD(r.retailPrice!);
    const p = toD(r.price);
    if (rp.lte(p)) continue;
    retail = retail.plus(rp);
    ours = ours.plus(p);
    n++;
  }
  if (n < 3) return null;
  return retail.minus(ours).div(retail).times(100).toDecimalPlaces(0, D.ROUND_DOWN).toNumber();
}

/** Admin publish/hide keeps agreement eligibility intact. */
export async function setProductHidden(productId: string, hidden: boolean) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { sellerId: true, hiddenAt: true },
  });
  if (!product) throw new CatalogueError("Product not found");
  if (!hidden && product.hiddenAt)
    throw new CatalogueError("Quality-hidden products cannot be republished");
  if (!hidden && product.sellerId && !(await canSell(product.sellerId)))
    throw new CatalogueError("The factory must accept the current agreement before publishing");
  return db.product.update({
    where: { id: productId },
    data: { status: hidden ? "ARCHIVED" : "LIVE" },
  });
}

/** Shop products with a Material Card, for the compare page (DEC-022) */
export async function shopProductsWithMaterial(excludeId: string, take = 24, now = new Date()) {
  return db.product.findMany({
    where: {
      id: { not: excludeId },
      materials: { some: { role: "SHELL" } },
      AND: [...IN_SHOP.AND, await shopEligibility(now)],
      hiddenAt: null,
      status: { not: "ARCHIVED" },
      variants: IN_SHOP.variants,
    },
    select: { id: true, title: true, brand: true },
    orderBy: { title: "asc" },
    take,
  });
}
