import "server-only";
import { z } from "zod";
import type { Prisma, StockType } from "@/generated/prisma/client";
import { type Audience, findKind, kindFits } from "@/lib/taxonomy";
import { D, toD } from "@/lib/decimal";
import { formatLKR } from "@/lib/format";
import { linkOnSite } from "@/lib/brand-rules";
import { lotPrice } from "@/lib/stock-rules";
import { db } from "./db";
import { logPrices } from "./prices";
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
  variants: { select: { size: true, available: true }, orderBy: { size: "asc" } },
} satisfies Prisma.ProductSelect;

/**
 * A product is in the shop while it has free stock in some size (product owner, 2026-10-20: no
 * product statuses). New, emptied and sold-out products are hidden. `Product.status` is unused.
 */
export const IN_SHOP = {
  variants: { some: { available: { gt: 0 } } },
} satisfies Prisma.ProductWhereInput;

/** Products in the shop. Sizes with no free stock are still listed but marked sold out. */
export async function listProducts(
  f: ProductFilters = {},
  take = 60,
  order: "newest" | "cheapest" = "newest",
) {
  return db.product.findMany({
    where: {
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
export async function suggestProducts(q: string, take = 6) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const rows = await db.product.findMany({
    where: {
      ...IN_SHOP,
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

export async function shopFacets() {
  const [brands, sizes] = await Promise.all([
    db.product.findMany({
      where: IN_SHOP,
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    }),
    db.variant.findMany({
      where: { available: { gt: 0 } },
      distinct: ["size"],
      select: { size: true },
      orderBy: { size: "asc" },
    }),
  ]);
  return { brands: brands.map((b) => b.brand), sizes: sizes.map((s) => s.size) };
}

/** One product with its sizes. Opens even when sold out, so links from carts keep working. */
export async function getProduct(id: string) {
  return db.product.findFirst({
    where: { id },
    include: { variants: { orderBy: [{ size: "asc" }, { colour: "asc" }] } },
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
    // A product from a lot takes the lot's price (cost + margin); others need one typed in.
    lotId: z.string().trim().optional(),
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
  .refine((v) => v.lotId || v.price, {
    message: "Enter our price, or choose the lot it came from",
    path: ["price"],
  });

/**
 * Creates or updates a product (admin). It shows in the shop once it has free stock. With a lot,
 * the price is the lot's price now (`src/server/lots.ts` keeps it in step).
 */
export async function saveProduct(id: string | null, input: unknown, photo: File | null) {
  const { lotId, price, ...p } = productSchema.parse(input);
  let lotData: { lotId: string | null; price: string };
  if (lotId) {
    const lot = await db.lot.findUnique({ where: { id: lotId } });
    if (!lot) throw new CatalogueError("Choose a lot from the list");
    lotData = { lotId, price: lotPrice(lot, new Date()).toString() };
  } else {
    lotData = { lotId: null, price: price! };
  }
  const data = {
    ...p,
    ...lotData,
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
  const saved = id
    ? await db.product.update({ where: { id }, data })
    : await db.product.create({ data: { ...data, stockType: p.stockType ?? "FACTORY_SURPLUS" } });
  await logPrices(db, [saved.id]);
  return saved;
}

/** Adds (or with a negative number, removes) free stock of a size. Never touches locked stock. */
export async function adjustStock(productId: string, size: string, colour: string, delta: number) {
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
  if (r.count === 0)
    throw new CatalogueError("Can't remove more than the free stock (locked stock stays in carts)");
}

/**
 * How far below retail our live prices are, over products that list a retail price above ours
 * (total saving / total retail, whole percent). Null until at least 3 products qualify.
 */
export async function retailSaving() {
  const rows = await db.product.findMany({
    where: { ...IN_SHOP, retailPrice: { not: null } },
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

/** Money taken so far: carts whose slip an admin approved. Formatted here so the client stays light. */
export async function salesSnapshot() {
  const s = await db.groupCart.aggregate({
    where: { status: { in: ["CONFIRMED", "DISPATCHED", "DELIVERED"] } },
    _sum: { total: true },
  });
  return { total: formatLKR(s._sum.total ?? 0), updatedAt: new Date().toISOString() };
}
