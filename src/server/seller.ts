import "server-only";
import { Prisma, type Product } from "@/generated/prisma/client";
import { CatalogueError, adjustStock, saveProduct } from "./catalogue";
import { sizesFor } from "@/lib/taxonomy";
import { db } from "./db";
import { notify } from "./notify";

/**
 * Factory sellers list stock; we hold it and sell it. A seller's product goes
 * DRAFT → IN_REVIEW (seller submits) → LIVE (an admin publishes it once the stock has arrived),
 * or back to DRAFT with a note. Sellers change details and stock only while it is a draft;
 * after that the admin manages it. Sellers never see buyers or sales.
 */

async function ownProduct(sellerId: string, productId: string): Promise<Product> {
  const p = await db.product.findFirst({ where: { id: productId, sellerId } });
  if (!p) throw new CatalogueError("Product not found");
  return p;
}

function assertDraft(p: Product) {
  if (p.status === "IN_REVIEW")
    throw new CatalogueError("This product is in review. Withdraw it to make changes.");
  if (p.status !== "DRAFT")
    throw new CatalogueError("This product is live. Ask GroupTogether to change it.");
}

const notDraft = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";

export async function sellerSaveProduct(
  sellerId: string,
  id: string | null,
  input: Record<string, unknown>,
  photo: File | null,
) {
  if (id) assertDraft(await ownProduct(sellerId, id));
  try {
    return await saveProduct(id, { ...input, status: "DRAFT" }, photo, sellerId);
  } catch (e) {
    if (notDraft(e)) throw new CatalogueError("This product is no longer a draft");
    throw e;
  }
}

/** The seller's size grid: blank is 0, otherwise a whole number of pieces. */
export function parseSizeCounts(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [size, v] of Object.entries(raw)) {
    const text = String(v ?? "").trim();
    const n = text === "" ? 0 : Number(text);
    if (!Number.isInteger(n) || n < 0 || n > 100_000)
      throw new CatalogueError(`Enter a whole number for size ${size}`);
    out[size] = n;
  }
  return out;
}

/**
 * Sets each size of the product's category to the number of pieces the seller has (sizes with
 * no colour; one product per colour). Sizes outside the category, left over from a change of
 * category, lose their free stock, and empty sizes that never reached a cart are dropped. Never
 * touches locked stock.
 */
async function setSellerStock(
  productId: string,
  kind: string | null,
  counts: Record<string, number>,
) {
  const sizes = sizesFor(kind ?? undefined);
  const rows = await db.variant.findMany({ where: { productId, colour: "" } });
  const have = (size: string) => rows.find((r) => r.size === size)?.available ?? 0;
  for (const size of sizes) {
    const want = counts[size] ?? 0;
    if (want !== have(size)) await adjustStock(productId, size, "", want - have(size));
  }
  for (const r of rows)
    if (!sizes.includes(r.size) && r.available > 0)
      await adjustStock(productId, r.size, "", -r.available);
  await db.variant.deleteMany({
    where: {
      productId,
      colour: "",
      available: 0,
      reserved: 0,
      sold: 0,
      lines: { none: {} },
    },
  });
}

/**
 * The seller's one-screen listing (product owner, 2026-10-19): details, photo and how many they
 * have in each size, saved together. With `send` it also goes for review, which needs stock.
 */
export async function sellerSaveListing(
  sellerId: string,
  id: string | null,
  input: Record<string, unknown>,
  photo: File | null,
  sizes: Record<string, unknown>,
  send: boolean,
) {
  const counts = parseSizeCounts(sizes);
  if (send && !Object.values(counts).some((n) => n > 0))
    throw new CatalogueError("Enter how many you have in at least one size");
  const p = await sellerSaveProduct(sellerId, id, input, photo);
  await setSellerStock(p.id, p.kind, counts);
  if (send) await submitForReview(sellerId, p.id);
  return p;
}

/** DRAFT → IN_REVIEW. Needs stock in at least one size; tells the admins. */
export async function submitForReview(sellerId: string, productId: string) {
  const p = await ownProduct(sellerId, productId);
  assertDraft(p);
  const stocked = await db.variant.count({ where: { productId, available: { gt: 0 } } });
  if (stocked === 0) throw new CatalogueError("Add stock for at least one size first");
  const r = await db.product.updateMany({
    where: { id: productId, sellerId, status: "DRAFT" },
    data: { status: "IN_REVIEW", reviewNote: null },
  });
  if (r.count === 0) throw new CatalogueError("This product is no longer a draft");

  const [seller, admins] = await Promise.all([
    db.user.findUnique({ where: { id: sellerId }, select: { company: true, name: true } }),
    db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
  ]);
  await notify(
    admins.map((a) => a.id),
    {
      title: "Product to review",
      body: `${seller?.company || seller?.name} submitted ${p.brand} ${p.title}.`,
      href: `/admin/products/${productId}`,
    },
  );
}

/** IN_REVIEW → DRAFT, so the seller can change it ("Edit" on a product waiting for review). */
export async function withdrawFromReview(sellerId: string, productId: string) {
  await ownProduct(sellerId, productId);
  const r = await db.product.updateMany({
    where: { id: productId, sellerId, status: "IN_REVIEW" },
    data: { status: "DRAFT" },
  });
  if (r.count === 0) throw new CatalogueError("This product isn't in review");
}

/** A draft that never reached a cart can be deleted with its sizes. */
export async function deleteDraft(sellerId: string, productId: string) {
  assertDraft(await ownProduct(sellerId, productId));
  const inCarts = await db.cartLine.count({ where: { variant: { productId } } });
  if (inCarts > 0)
    throw new CatalogueError("This product has been in carts, so it can't be deleted");
  const r = await db.product.deleteMany({ where: { id: productId, sellerId, status: "DRAFT" } });
  if (r.count === 0) throw new CatalogueError("This product is no longer a draft");
}

// ─── Admin review ─────────────────────────────────────────────────────────

/** IN_REVIEW → LIVE: on sale from now. The admin checks the stock has arrived first. */
export async function publishProduct(productId: string) {
  const r = await db.product.updateMany({
    where: { id: productId, status: "IN_REVIEW" },
    data: { status: "LIVE", reviewNote: null },
  });
  if (r.count === 0) throw new CatalogueError("This product isn't waiting for review");
  const p = await db.product.findUniqueOrThrow({ where: { id: productId } });
  if (p.sellerId)
    await notify([p.sellerId], {
      title: "Your product is live",
      body: `${p.brand} ${p.title} is now on sale on GroupTogether.`,
      href: `/seller/products/${p.id}`,
    });
}

/** IN_REVIEW → DRAFT with a note telling the seller what to fix. */
export async function returnToSeller(productId: string, note: string) {
  const reason = note.trim();
  if (reason.length < 3) throw new CatalogueError("Tell the seller what to change");
  const r = await db.product.updateMany({
    where: { id: productId, status: "IN_REVIEW" },
    data: { status: "DRAFT", reviewNote: reason },
  });
  if (r.count === 0) throw new CatalogueError("This product isn't waiting for review");
  const p = await db.product.findUniqueOrThrow({ where: { id: productId } });
  if (p.sellerId)
    await notify([p.sellerId], {
      title: "Your product needs changes",
      body: `${p.brand} ${p.title}: ${reason}`,
      href: `/seller/products/${p.id}`,
    });
}
