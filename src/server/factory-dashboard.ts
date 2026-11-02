import "server-only";
import { D } from "@/lib/decimal";
import { colomboIsoDay } from "@/lib/format";
import { db } from "./db";

const PAID = ["CONFIRMED", "DISPATCHED", "DELIVERED"] as const;

/**
 * A factory's own sales (product owner, 2026-11-03): pieces and sales value per product and per
 * month, its orders by stage, sizes sold and stock left, and its ratings. Only its own products
 * and orders; never buyer names.
 */
export async function factoryDashboard(factoryId: string, now = new Date()) {
  const [products, lines, carts, ratings] = await Promise.all([
    db.product.findMany({
      where: { sellerId: factoryId },
      select: {
        id: true,
        title: true,
        status: true,
        price: true,
        variants: {
          select: { size: true, colour: true, available: true, reserved: true },
          orderBy: [{ size: "asc" }, { colour: "asc" }],
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.cartLine.findMany({
      where: {
        variant: { product: { sellerId: factoryId } },
        cart: { status: { in: [...PAID] } },
      },
      select: {
        qty: true,
        unitPrice: true,
        variant: { select: { size: true, productId: true } },
        cart: { select: { confirmedAt: true } },
      },
    }),
    db.groupCart.findMany({
      where: {
        status: { in: [...PAID] },
        lines: { some: { variant: { product: { sellerId: factoryId } } } },
      },
      select: { status: true, factoryPackedAt: true, delivery: { select: { status: true } } },
    }),
    db.factoryRating.findMany({
      where: { factoryId },
      select: { stars: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const byProduct = new Map<string, { pieces: number; value: D; sizes: Map<string, number> }>();
  const months = new Map<string, { pieces: number; value: D }>();
  // The last six months, oldest first, so empty months still show.
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    months.set(colomboIsoDay(d).slice(0, 7), { pieces: 0, value: new D(0) });
  }
  let pieces = 0;
  let value = new D(0);
  for (const l of lines) {
    const amount = new D(l.unitPrice.toString()).times(l.qty);
    pieces += l.qty;
    value = value.plus(amount);
    const p = byProduct.get(l.variant.productId) ?? {
      pieces: 0,
      value: new D(0),
      sizes: new Map(),
    };
    p.pieces += l.qty;
    p.value = p.value.plus(amount);
    p.sizes.set(l.variant.size, (p.sizes.get(l.variant.size) ?? 0) + l.qty);
    byProduct.set(l.variant.productId, p);
    const m = l.cart.confirmedAt && months.get(colomboIsoDay(l.cart.confirmedAt).slice(0, 7));
    if (m) {
      m.pieces += l.qty;
      m.value = m.value.plus(amount);
    }
  }

  const stage = (c: (typeof carts)[number]) => {
    if (c.status === "DELIVERED") return "delivered";
    const d = c.delivery?.status;
    if (d === "FAILED" || d === "CANCELLED") return "failed";
    if (d === "PICKED_UP") return "onTheWay";
    if (d === "BOOKED" || c.factoryPackedAt) return "awaitingPickup";
    return "toPack";
  };
  const orders = { toPack: 0, awaitingPickup: 0, onTheWay: 0, delivered: 0, failed: 0 };
  for (const c of carts) orders[stage(c)]++;

  return {
    pieces,
    value,
    months: [...months].map(([month, m]) => ({ month, ...m })),
    orders,
    products: products.map((p) => {
      const sold = byProduct.get(p.id);
      return {
        ...p,
        pieces: sold?.pieces ?? 0,
        value: sold?.value ?? new D(0),
        sizesSold: [...(sold?.sizes ?? new Map<string, number>())].sort((a, b) => b[1] - a[1]),
        stockLeft: p.variants.reduce((n, v) => n + v.available, 0),
      };
    }),
    rating: {
      average: ratings.length ? ratings.reduce((n, r) => n + r.stars, 0) / ratings.length : null,
      count: ratings.length,
      recent: ratings.slice(0, 5),
    },
  };
}
