import "server-only";
import { lockUserAdvisory } from "./orders/locks";
import { z } from "zod";
import type { Prisma, StockType } from "@/generated/prisma/client";
import { type Audience, findKind, kindFits } from "@/lib/taxonomy";
import { D, toD } from "@/lib/decimal";
import { linkOnSite } from "@/lib/brand-rules";
import { db } from "./db";
import { canSell, canSellIn, sellingFactoryWhere } from "./agreements";
import { buyerPrice } from "@/lib/price-rules";
import { getSettings } from "./settings";
import { IMAGE_TYPES, checkUpload, saveUpload } from "./storage";

export class CatalogueError extends Error {}

export type ProductFilters = {
  audience?: Audience;
  kind?: string;
  stockType?: StockType;
  brand?: string;
  size?: string;
  q?: string;
};

const listSelect = {
  id: true,
  title: true,
  brand: true,
  category: true,
  stockType: true,
  price: true,
  retailPrice: true,
  photoKey: true,
  sellerId: true,
  seller: { select: { name: true, company: true } },
  variants: { select: { size: true, available: true }, orderBy: { size: "asc" } },
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

/** Products in the shop. Sizes with no free stock are still listed but marked sold out. */
export async function listProducts(
  f: ProductFilters = {},
  take = 60,
  order: "newest" | "cheapest" = "newest",
  now = new Date(),
) {
  return db.product.findMany({
    where: {
      ...IN_SHOP,
      AND: [...IN_SHOP.AND, await shopEligibility(now)],
      audience: f.audience,
      kind: f.kind,
      stockType: f.stockType,
      brand: f.brand ? { equals: f.brand, mode: "insensitive" } : undefined,
      variants: f.size ? { some: { size: f.size, available: { gt: 0 } } } : IN_SHOP.variants,
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
  const [brands, sizes] = await Promise.all([
    db.product.findMany({
      where: { ...IN_SHOP, AND: [...IN_SHOP.AND, eligibility] },
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    }),
    db.variant.findMany({
      where: { available: { gt: 0 }, product: { ...IN_SHOP, AND: [...IN_SHOP.AND, eligibility] } },
      distinct: ["size"],
      select: { size: true },
      orderBy: { size: "asc" },
    }),
  ]);
  return { brands: brands.map((b) => b.brand), sizes: sizes.map((s) => s.size) };
}

/** One product with its sizes. Opens even when sold out, so links from carts keep working. */
export async function getProduct(id: string, now = new Date()) {
  return db.product.findFirst({
    where: {
      id,
      hiddenAt: null,
      status: { not: "ARCHIVED" },
      AND: [...IN_SHOP.AND, await shopEligibility(now)],
    },
    include: {
      variants: { orderBy: [{ size: "asc" }, { colour: "asc" }] },
      seller: { select: { name: true, company: true } },
    },
  });
}

// ─── Admin ────────────────────────────────────────────────────────────────

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount such as 4500 or 4500.50");

export const productSchema = z
  .object({
    title: z.string().trim().min(2, "Enter a title").max(120),
    brand: z.string().trim().min(1, "Enter the brand").max(60),
    description: z.string().trim().max(2000).default(""),
    audience: z.enum(["MEN", "WOMEN", "GIRL", "BOY", "KID"], { message: "Choose who it is for" }),
    kind: z.string().min(1, "Choose a category"),
    // No longer chosen in the form (product owner, 2026-10-20): kept as stored, new ones surplus.
    stockType: z.enum(["FACTORY_SURPLUS", "B_GRADE"]).optional(),
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
  .refine((v) => kindFits(v.audience, v.kind), {
    message: "That category isn't offered for this audience",
    path: ["kind"],
  })
  .refine((v) => v.price, {
    message: "Enter the price",
    path: ["price"],
  });

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
  if (ownerId && !(await canSell(ownerId)))
    throw new CatalogueError("Accept the current factory agreement before listing products");
  const parsed = productSchema.parse(input);
  // Factories set their own price; brand links are ours.
  const { price, ...p } = sellerId ? { ...parsed, brandUrl: "" } : parsed;
  const data = {
    ...p,
    price: price!,
    category: findKind(p.kind)!.category,
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
      const commission = fresh
        ? (fresh.commission?.toString() ?? "0")
        : (await getSettings(tx)).commissionPerPiece.toString();
      try {
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
            stockType: p.stockType ?? "FACTORY_SURPLUS",
            ...(sellerId ? { sellerId, status: "LIVE" as const } : {}),
          },
        });
  });
  return saved;
}

/**
 * Adds (or with a negative number, removes) free stock of a size. Never touches locked stock.
 * A factory (`sellerId`) changes only its own products.
 */
export async function adjustStock(
  productId: string,
  size: string,
  colour: string,
  delta: number,
  { sellerId }: { sellerId?: string } = {},
) {
  if (await db.product.count({ where: { id: productId, seller: { isBrand: true } } }))
    throw new CatalogueError("Premium brand products are managed in Brand rewards");
  if (sellerId && !(await db.product.count({ where: { id: productId, sellerId } })))
    throw new CatalogueError("Product not found");
  if (!Number.isInteger(delta) || delta === 0) throw new CatalogueError("Enter a whole number");
  const s = size.trim();
  if (!s) throw new CatalogueError("Enter the size");
  const existing = await db.variant.findUnique({
    where: { productId_size_colour: { productId, size: s, colour: colour.trim() } },
  });
  if (!existing) {
    if (delta < 0) throw new CatalogueError("That size has no stock to remove");
    return db.variant.create({
      data: { productId, size: s, colour: colour.trim(), available: delta },
    });
  }
  const r = await db.variant.updateMany({
    where: { id: existing.id, available: { gte: -delta } },
    data: { available: { increment: delta } },
  });
  if (r.count === 0) throw new CatalogueError("Can't remove more than the free stock");
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
