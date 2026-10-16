import "server-only";
import { z } from "zod";
import type { Category, Prisma, StockType } from "@/generated/prisma/client";
import { db } from "./db";
import { IMAGE_TYPES, checkUpload, saveUpload } from "./storage";

export class CatalogueError extends Error {}

export type ProductFilters = {
  category?: Category;
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
  defectNotes: true,
  variants: { select: { size: true, available: true }, orderBy: { size: "asc" } },
} satisfies Prisma.ProductSelect;

/** Live products for the shop. Sizes with no free stock are still listed but marked sold out. */
export async function listProducts(f: ProductFilters = {}, take = 60) {
  return db.product.findMany({
    where: {
      status: "LIVE",
      category: f.category,
      stockType: f.stockType,
      brand: f.brand ? { equals: f.brand, mode: "insensitive" } : undefined,
      variants: f.size ? { some: { size: f.size, available: { gt: 0 } } } : undefined,
      OR: f.q
        ? [
            { title: { contains: f.q, mode: "insensitive" } },
            { brand: { contains: f.q, mode: "insensitive" } },
          ]
        : undefined,
    },
    select: listSelect,
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function shopFacets() {
  const [brands, sizes] = await Promise.all([
    db.product.findMany({
      where: { status: "LIVE" },
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    }),
    db.variant.findMany({
      where: { product: { status: "LIVE" }, available: { gt: 0 } },
      distinct: ["size"],
      select: { size: true },
      orderBy: { size: "asc" },
    }),
  ]);
  return { brands: brands.map((b) => b.brand), sizes: sizes.map((s) => s.size) };
}

export async function getProduct(id: string, { live = true } = {}) {
  return db.product.findFirst({
    where: { id, status: live ? "LIVE" : undefined },
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
    category: z.enum(["SHOES", "APPAREL"]),
    stockType: z.enum(["FACTORY_SURPLUS", "B_GRADE"]),
    defectNotes: z.string().trim().max(500).optional().default(""),
    price: money,
    retailPrice: money.optional().or(z.literal("")),
    status: z.enum(["DRAFT", "LIVE", "ARCHIVED"]).default("DRAFT"),
  })
  .refine((v) => v.stockType !== "B_GRADE" || v.defectNotes.length >= 3, {
    message: "Describe what is wrong with B-grade stock",
    path: ["defectNotes"],
  });

export async function saveProduct(id: string | null, input: unknown, photo: File | null) {
  const p = productSchema.parse(input);
  const data = {
    ...p,
    defectNotes: p.defectNotes || null,
    retailPrice: p.retailPrice || null,
    ...(photo && photo.size > 0
      ? await (async () => {
          checkUpload(photo, IMAGE_TYPES, "photo");
          const s = await saveUpload(photo, "products", IMAGE_TYPES);
          return { photoKey: s.storageKey, photoType: s.contentType };
        })()
      : {}),
  };
  return id ? db.product.update({ where: { id }, data }) : db.product.create({ data });
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
