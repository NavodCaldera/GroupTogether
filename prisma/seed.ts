/**
 * Demo data: 1 admin, 1 factory seller, 2 packing staff, 3 buyers, about 20 products, and carts in several
 * states. Every account's password is "password123". Resets the database first.
 *
 *   admin@groupbasket.lk  admin       → /admin
 *   seller@example.com      seller      → /seller (Ceylon Footwear Mills: a tested linen shirt and its bulk)
 *   brand@example.com       brand       → /seller (Serendib Atelier, a luxury brand)
 *   packer@example.com      packing     → /packing (Kasun: one paid order to check and gather)
 *   packer2@example.com     packing     → /packing (Ishara: rechecks and packs what Kasun gathered)
 *   buyer@example.com       buyer       → /dashboard (public cart at 49,800, delivered order, invite)
 *   buyer2@example.com      buyer       → /dashboard (private cart at the minimum)
 *   buyer3@example.com      buyer       → /dashboard (paid order being packed; no active cart, free to join)
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type User, type Variant } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";
import { findKind } from "../src/lib/taxonomy";
import { addHours, newCartCode } from "../src/lib/cart-rules";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** Audience and category id for each demo product (see src/lib/taxonomy.ts). */
const KIND_OF: Record<string, ["MEN" | "WOMEN" | "BOY", string]> = {
  "Court Classic leather sneaker": ["MEN", "men-sneakers"],
  "Runner Air mesh trainer": ["MEN", "men-sneakers"],
  "Canvas low-top": ["WOMEN", "women-sneakers"],
  "Office derby shoe": ["MEN", "men-formal"],
  "Trail hiker mid": ["MEN", "men-sneakers"],
  "Slide sandal": ["WOMEN", "women-sandals"],
  "School black shoe": ["BOY", "boy-shoes"],
  "Basketball high-top": ["MEN", "men-sneakers"],
  "Crew-neck cotton tee (3-pack)": ["MEN", "men-tshirts"],
  "Oxford button-down shirt": ["MEN", "men-shirts"],
  "Slim chino": ["MEN", "men-trousers"],
  "Denim jacket": ["WOMEN", "women-jackets"],
  "Running shorts": ["MEN", "men-shorts"],
  "Hooded sweatshirt": ["MEN", "men-jackets"],
  "Linen summer dress": ["WOMEN", "women-dresses"],
  "Polo shirt": ["MEN", "men-tshirts"],
  "Track pants": ["MEN", "men-trousers"],
};

type Seed = {
  title: string;
  brand: string;
  category: "SHOES" | "APPAREL";
  stockType: "FACTORY_SURPLUS" | "B_GRADE";
  price: number;
  retail: number;
  description: string;
};

const PRODUCTS: Seed[] = [
  {
    title: "Court Classic leather sneaker",
    brand: "Stride",
    category: "SHOES",
    stockType: "FACTORY_SURPLUS",
    price: 6900,
    retail: 14500,
    description: "Full-grain leather upper, rubber cupsole. End-of-run export order.",
  },
  {
    title: "Runner Air mesh trainer",
    brand: "Velo",
    category: "SHOES",
    stockType: "FACTORY_SURPLUS",
    price: 7500,
    retail: 16900,
    description: "Breathable mesh, EVA midsole. Surplus from a European order.",
  },
  {
    title: "Runner Air mesh trainer",
    brand: "Velo",
    category: "SHOES",
    stockType: "B_GRADE",
    price: 4200,
    retail: 16900,
    description: "Same shoe as the surplus pair, cosmetic seconds.",
  },
  {
    title: "Canvas low-top",
    brand: "Harbour",
    category: "SHOES",
    stockType: "FACTORY_SURPLUS",
    price: 3200,
    retail: 6500,
    description: "Cotton canvas, vulcanised sole.",
  },
  {
    title: "Canvas low-top",
    brand: "Harbour",
    category: "SHOES",
    stockType: "B_GRADE",
    price: 1900,
    retail: 6500,
    description: "Cosmetic seconds.",
  },
  {
    title: "Office derby shoe",
    brand: "Mayfair",
    category: "SHOES",
    stockType: "FACTORY_SURPLUS",
    price: 8900,
    retail: 18500,
    description: "Leather derby with a leather-lined insole.",
  },
  {
    title: "Trail hiker mid",
    brand: "Ridge",
    category: "SHOES",
    stockType: "B_GRADE",
    price: 9500,
    retail: 24000,
    description: "Waterproof membrane, lugged outsole.",
  },
  {
    title: "Slide sandal",
    brand: "Shore",
    category: "SHOES",
    stockType: "FACTORY_SURPLUS",
    price: 1500,
    retail: 3500,
    description: "Moulded EVA, one-piece.",
  },
  {
    title: "School black shoe",
    brand: "Mayfair",
    category: "SHOES",
    stockType: "FACTORY_SURPLUS",
    price: 3900,
    retail: 7200,
    description: "Durable synthetic upper, non-marking sole.",
  },
  {
    title: "Basketball high-top",
    brand: "Stride",
    category: "SHOES",
    stockType: "B_GRADE",
    price: 7800,
    retail: 21000,
    description: "Padded collar, herringbone outsole.",
  },
  {
    title: "Crew-neck cotton tee (3-pack)",
    brand: "Basics Co",
    category: "APPAREL",
    stockType: "FACTORY_SURPLUS",
    price: 2400,
    retail: 5400,
    description: "100% cotton, 180 gsm. Overrun from an export order.",
  },
  {
    title: "Oxford button-down shirt",
    brand: "Mayfair",
    category: "APPAREL",
    stockType: "FACTORY_SURPLUS",
    price: 3500,
    retail: 7900,
    description: "Cotton oxford, regular fit.",
  },
  {
    title: "Oxford button-down shirt",
    brand: "Mayfair",
    category: "APPAREL",
    stockType: "B_GRADE",
    price: 1900,
    retail: 7900,
    description: "Cosmetic seconds.",
  },
  {
    title: "Slim chino",
    brand: "Harbour",
    category: "APPAREL",
    stockType: "FACTORY_SURPLUS",
    price: 3900,
    retail: 8500,
    description: "Stretch cotton twill.",
  },
  {
    title: "Denim jacket",
    brand: "Ridge",
    category: "APPAREL",
    stockType: "B_GRADE",
    price: 4500,
    retail: 12500,
    description: "12 oz denim, classic fit.",
  },
  {
    title: "Running shorts",
    brand: "Velo",
    category: "APPAREL",
    stockType: "FACTORY_SURPLUS",
    price: 1600,
    retail: 3900,
    description: "Quick-dry, inner brief.",
  },
  {
    title: "Hooded sweatshirt",
    brand: "Basics Co",
    category: "APPAREL",
    stockType: "FACTORY_SURPLUS",
    price: 3600,
    retail: 8200,
    description: "Brushed fleece, kangaroo pocket.",
  },
  {
    title: "Linen summer dress",
    brand: "Shore",
    category: "APPAREL",
    stockType: "FACTORY_SURPLUS",
    price: 4200,
    retail: 9800,
    description: "Linen-cotton blend.",
  },
  {
    title: "Polo shirt",
    brand: "Stride",
    category: "APPAREL",
    stockType: "B_GRADE",
    price: 1700,
    retail: 4900,
    description: "Piqué cotton.",
  },
  {
    title: "Track pants",
    brand: "Velo",
    category: "APPAREL",
    stockType: "FACTORY_SURPLUS",
    price: 2900,
    retail: 6500,
    description: "Tapered, zip pockets.",
  },
];

async function main() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length)
    await db.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} CASCADE`,
    );

  await db.settings.create({
    data: {
      id: 1,
      bankName: "Commercial Bank",
      bankBranch: "Colombo 03",
      accountName: "GroupBasket (Pvt) Ltd",
      accountNumber: "1000 2345 6789",
    },
  });

  const passwordHash = await hashPassword("password123");
  await db.user.create({
    data: {
      role: "ADMIN",
      name: "Admin",
      email: "admin@groupbasket.lk",
      phone: "0700000000",
      passwordHash,
    },
  });
  // Packing staff (rule 17): they pack paid orders and check each other's packing.
  const [kasun, ishara] = await Promise.all(
    [
      ["Kasun Perera", "packer@example.com", "0711111111"],
      ["Ishara Fernando", "packer2@example.com", "0712222222"],
    ].map(([name, email, phone]) =>
      db.user.create({ data: { role: "PACKER", name, email, phone, passwordHash } }),
    ),
  );
  // The only buyers: Dilan, Sachini and Tharindu (all listed on the sign-in page).
  const people = [
    [
      "Dilan Wickramasinghe",
      "buyer@example.com",
      "0777777777",
      "27 Ward Pl",
      "Colombo 07",
      6.9147,
      79.8678,
    ],
    [
      "Sachini Gunawardena",
      "buyer2@example.com",
      "0778888888",
      "14 Hill St",
      "Kandy",
      7.2906,
      80.6337,
    ],
    [
      "Tharindu Senanayake",
      "buyer3@example.com",
      "0779999999",
      "5 Beach Rd",
      "Galle",
      6.0535,
      80.221,
    ],
  ] as const;
  const users: User[] = [];
  for (const [name, email, phone, address, city, lat, lng] of people) {
    users.push(
      await db.user.create({ data: { name, email, phone, address, city, lat, lng, passwordHash } }),
    );
  }

  const variants: (Variant & { price: number })[] = [];
  for (const p of PRODUCTS) {
    const [audience, kind] = KIND_OF[p.title] ?? ["MEN", "men-tshirts"];
    // Same number of sizes as before, so the carts below keep pointing at the same variants.
    const sizes = findKind(kind)!.sizes.slice(0, p.category === "SHOES" ? 6 : 4);
    const product = await db.product.create({
      data: {
        title: p.title,
        brand: p.brand,
        category: p.category,
        audience,
        kind,
        stockType: p.stockType,
        price: p.price,
        retailPrice: p.retail,
        description: p.description,
        status: "LIVE",
        variants: {
          create: sizes.map((size, i) => ({
            size,
            available: p.stockType === "B_GRADE" ? 3 + i : 10 + i * 2,
          })),
        },
      },
      include: { variants: true },
    });
    variants.push(...product.variants.map((v) => ({ ...v, price: p.price })));
  }

  const now = new Date();
  /** Variants already in a demo cart, so later picks don't reuse their (now stale) stock. */
  const used = new Set<number>();
  /** A cart whose lines lock stock, as the app does. */
  async function cart(
    ownerIdx: number,
    _label: string,
    lines: [number, number, number][],
    extra: object = {},
    visibility: "PUBLIC" | "PRIVATE" = "PUBLIC",
  ) {
    const memberIdx = [...new Set([ownerIdx, ...lines.map((l) => l[0])])];
    for (const [, vi] of lines) used.add(vi);
    let total = 0;
    for (const [, vi, qty] of lines) total += variants[vi].price * qty;
    const c = await db.groupCart.create({
      data: {
        code: newCartCode(randomBytes),
        name: `${users[ownerIdx].name}'s cart`,
        ownerId: users[ownerIdx].id,
        visibility,
        minOrderValue: 50000,
        total,
        status: total >= 50000 ? "READY" : "OPEN",
        readyAt: total >= 50000 ? now : null,
        expiresAt: addHours(now, 20),
        members: { create: memberIdx.map((i) => ({ userId: users[i].id })) },
        lines: {
          create: lines.map(([ui, vi, qty]) => ({
            userId: users[ui].id,
            variantId: variants[vi].id,
            qty,
            unitPrice: variants[vi].price,
          })),
        },
        ...extra,
      },
    });
    for (const [, vi, qty] of lines) {
      await db.variant.update({
        where: { id: variants[vi].id },
        data: { available: { decrement: qty }, reserved: { increment: qty } },
      });
    }
    return c;
  }

  // One cart at a time (CLAUDE.md rule 12): each buyer owns at most one active cart.
  // Dilan's public cart sits at 49,800, one item short of the minimum. Sachini's private cart
  // has reached it (she can accept & pay). Tharindu is in no active cart, free to join one.
  const [DILAN, SACHINI, THARINDU] = [0, 1, 2];
  const buyer = users[DILAN];
  await cart(DILAN, "Office sneaker run", [
    [DILAN, 2, 2],
    [DILAN, 8, 1],
    [DILAN, 40, 3],
  ]);
  const privateCart = await cart(
    SACHINI,
    "Sachini's friends only",
    [
      [SACHINI, 0, 3],
      [SACHINI, 30, 2],
      [SACHINI, 76, 3],
      [SACHINI, 90, 2],
    ],
    {},
    "PRIVATE",
  );
  // Dilan is already in a cart, so this invite lets him try "ask to join" (rule 14).
  await db.cartInvite.create({
    data: { cartId: privateCart.id, invitedById: users[SACHINI].id, invitedUserId: buyer.id },
  });

  /** An unused variant priced 3,000+ with enough free stock for `qty`. */
  const pick = (qty: number) => {
    const i = variants.findIndex((v, n) => !used.has(n) && v.price >= 3000 && v.available >= qty);
    if (i < 0) throw new Error("seed: no variant with enough stock");
    used.add(i);
    return i;
  };
  // A past order that went all the way: paid, confirmed and delivered by PickMe.
  const vi = variants.findIndex(
    (v, n) => !used.has(n) && v.available * v.price >= 45000 && v.price >= 3000,
  );
  if (vi < 0) throw new Error("seed: no variant for the delivered order");
  used.add(vi);
  const qty = Math.min(variants[vi].available, Math.ceil(45000 / variants[vi].price));
  const vj = pick(2);
  const lines: [number, number, number][] = [
    [DILAN, vi, qty],
    [THARINDU, vj, 2],
  ];
  const total = lines.reduce((n, [, v, q]) => n + variants[v].price * q, 0);
  const past = addHours(now, -30);
  const delivered = await db.groupCart.create({
    data: {
      code: newCartCode(randomBytes),
      name: "Dilan's first group order",
      ownerId: buyer.id,
      status: "DELIVERED",
      minOrderValue: 50000,
      total,
      expiresAt: addHours(past, 24),
      readyAt: past,
      acceptedAt: addHours(past, 1),
      slipDueAt: addHours(past, 3),
      confirmedAt: addHours(past, 2),
      deliveryAddress: buyer.address,
      deliveryCity: buyer.city,
      deliveryLat: buyer.lat,
      deliveryLng: buyer.lng,
      deliveryPhone: buyer.phone,
      members: { create: [{ userId: buyer.id }, { userId: users[THARINDU].id }] },
      lines: {
        create: lines.map(([ui, v, q]) => ({
          userId: users[ui].id,
          variantId: variants[v].id,
          qty: q,
          unitPrice: variants[v].price,
        })),
      },
      delivery: {
        create: {
          provider: "manual",
          status: "DELIVERED",
          externalRef: "PM-DEMO-1",
          quotedFee: 850,
        },
      },
    },
  });
  for (const [, v, q] of lines) {
    await db.variant.update({
      where: { id: variants[v].id },
      data: { available: { decrement: q }, sold: { increment: q } },
    });
  }
  // Kasun checked and gathered it, Ishara rechecked and packed it and handed it to PickMe.
  await db.packing.create({
    data: {
      cartId: delivered.id,
      gatheredById: kasun.id,
      gatheredAt: addHours(past, 2.5),
      packedById: ishara.id,
      packedAt: addHours(past, 3),
      handedOverById: ishara.id,
      handedOverAt: addHours(past, 4),
    },
  });

  // Paid orders at each packing stage, so the packing staff's list is never empty: to gather
  // (Tharindu), to pack (Sachini, gathered by Kasun), for PickMe (Dilan, packed by Ishara and
  // booked with PickMe). The delivered order above is the "handed over" one.
  const paidOrder = async (ui: number, hoursAgo: number, stage: "gather" | "pack" | "ready") => {
    const pi = variants.findIndex(
      (v, n) => !used.has(n) && v.available * v.price >= 50000 && v.price >= 3000,
    );
    if (pi < 0) throw new Error("seed: no variant for the order to pack");
    used.add(pi);
    const owner = users[ui];
    const packQty = Math.ceil(50000 / variants[pi].price);
    const paidAt = addHours(now, -hoursAgo);
    const c = await db.groupCart.create({
      data: {
        code: newCartCode(randomBytes),
        name: `${owner.name}'s cart`,
        ownerId: owner.id,
        status: stage === "ready" ? "DISPATCHED" : "CONFIRMED",
        minOrderValue: 50000,
        total: variants[pi].price * packQty,
        createdAt: addHours(paidAt, -2),
        expiresAt: addHours(paidAt, 24),
        readyAt: paidAt,
        acceptedAt: addHours(paidAt, 1),
        slipDueAt: addHours(paidAt, 3),
        confirmedAt: addHours(paidAt, 2),
        deliveryAddress: owner.address,
        deliveryCity: owner.city,
        deliveryLat: owner.lat,
        deliveryLng: owner.lng,
        deliveryPhone: owner.phone,
        members: { create: [{ userId: owner.id }] },
        lines: {
          create: [
            {
              userId: owner.id,
              variantId: variants[pi].id,
              qty: packQty,
              unitPrice: variants[pi].price,
            },
          ],
        },
        ...(stage === "ready"
          ? {
              delivery: {
                create: {
                  provider: "manual",
                  status: "BOOKED",
                  externalRef: "PM-DEMO-2",
                  quotedFee: 850,
                  driverName: "Nimal",
                },
              },
            }
          : {}),
      },
    });
    await db.variant.update({
      where: { id: variants[pi].id },
      data: { available: { decrement: packQty }, sold: { increment: packQty } },
    });
    if (stage !== "gather") {
      await db.packing.create({
        data: {
          cartId: c.id,
          gatheredById: kasun.id,
          gatheredAt: addHours(paidAt, 2.5),
          ...(stage === "ready" ? { packedById: ishara.id, packedAt: addHours(paidAt, 3) } : {}),
        },
      });
    }
  };
  await paidOrder(THARINDU, 3, "gather");
  await paidOrder(SACHINI, 2, "pack");
  await paidOrder(DILAN, 1, "ready");

  // ─── Demo factory seller: one product on sale and three stock offers ──
  const seller = await db.user.create({
    data: {
      role: "SELLER",
      name: "Nuwan Rajapaksha",
      company: "Ceylon Footwear Mills",
      email: "seller@example.com",
      phone: "0776666666",
      address: "42 Factory Road, Ekala Industrial Estate",
      city: "Ja-Ela",
      lat: 7.0827,
      lng: 79.9021,
      passwordHash,
    },
  });
  const sellerProducts = [
    {
      title: "Factory leather loafer",
      kind: "men-formal",
      audience: "MEN",
      status: "LIVE",
      price: 6200,
      retailPrice: 14500,
      stockType: "FACTORY_SURPLUS",
      reviewNote: null,
    },
  ] as const;
  for (const p of sellerProducts) {
    const k = findKind(p.kind)!;
    await db.product.create({
      data: {
        title: p.title,
        brand: "Ceylon",
        category: k.category,
        audience: p.audience,
        kind: p.kind,
        stockType: p.stockType,
        price: p.price,
        retailPrice: p.retailPrice,
        description: "Made in our Ja-Ela factory. Overrun from an export order.",
        status: p.status,
        reviewNote: p.reviewNote,
        sellerId: seller.id,
        variants: { create: k.sizes.slice(0, 4).map((size, i) => ({ size, available: 6 + i })) },
      },
    });
  }

  // Stock offers (product owner, 2026-10-19): one waiting for review, one accepted, one declined.
  const offers = [
    {
      name: "Ladies block-heel sandals",
      description: "420 pairs, sizes 5 to 9, black and tan. B-grade: small glue marks.",
      amount: 840000,
      status: "IN_REVIEW",
      note: null,
      ago: 3,
    },
    {
      name: "Kids school sneakers",
      description: "300 pairs, white, UK 10 to UK 3. Overrun from an export order.",
      amount: 540000,
      status: "ACCEPTED",
      note: null,
      ago: 50,
    },
    {
      name: "Men's canvas belts",
      description: "1,000 belts, mixed colours.",
      amount: 300000,
      status: "DECLINED",
      note: null,
      ago: 120,
    },
  ] as const;
  for (const o of offers)
    await db.stockOffer.create({
      data: {
        sellerId: seller.id,
        name: o.name,
        description: o.description,
        amount: o.amount,
        status: o.status,
        note: o.note,
        createdAt: addHours(now, -o.ago),
        decidedAt: o.status === "IN_REVIEW" ? null : addHours(now, -o.ago + 4),
      },
    });

  // ─── A tested design (product owner, 2026-10-24): 24 test pieces of a linen shirt sold out ──
  // in its sizes M and L at LKR 2,400, so the factory made the bulk; it went onto the same product
  // at LKR 2,150. The seller dashboard shows it as a design with its price and pieces by day.
  const DAY = 86_400_000;
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
  // Pieces stocked per size (test + bulk) and sold, so the sizes add up with the carts below.
  const shirtSizes = { S: [43, 6], M: [89, 33], L: [88, 24], XL: [44, 6] } as const;
  const shirt = await db.product.create({
    data: {
      title: "Linen short-sleeve shirt",
      brand: "Ceylon",
      category: "APPAREL",
      audience: "MEN",
      kind: "men-shirts",
      stockType: "FACTORY_SURPLUS",
      price: 2150,
      retailPrice: 4900,
      description: "Washed linen, short sleeves. Made in our Ja-Ela factory.",
      status: "LIVE",
      sellerId: seller.id,
      createdAt: daysAgo(21),
      variants: {
        create: Object.entries(shirtSizes).map(([size, [stocked, sold]]) => ({
          size,
          available: stocked - sold,
          sold,
        })),
      },
      prices: {
        create: [
          { price: 2400, at: daysAgo(21) },
          { price: 2150, at: daysAgo(6) },
        ],
      },
    },
    include: { variants: true },
  });
  const shirtSize = (size: keyof typeof shirtSizes) =>
    shirt.variants.find((v) => v.size === size)!.id;
  for (const o of [
    {
      kind: "TEST",
      name: "Linen shirt test run",
      description: "24 pieces, S to XL, white.",
      amount: 36000,
      sent: 24,
      received: 21,
    },
    {
      kind: "BULK",
      name: "Linen shirt bulk",
      description: "240 pieces, S to XL, white.",
      amount: 312000,
      sent: 12,
      received: 6,
    },
  ] as const)
    await db.stockOffer.create({
      data: {
        sellerId: seller.id,
        kind: o.kind,
        name: o.name,
        description: o.description,
        amount: o.amount,
        status: "ACCEPTED",
        productId: shirt.id,
        createdAt: daysAgo(o.sent),
        decidedAt: daysAgo(o.sent - 0.2),
        receivedById: kasun.id,
        receivedAt: daysAgo(o.received),
      },
    });
  /** A past cart of shirts: [buyer, size, qty] lines at `price`, paid and delivered or expired. */
  const shirtCart = async (
    ago: number,
    price: number,
    lines: [number, keyof typeof shirtSizes, number][],
    paid: boolean,
  ) => {
    const at = daysAgo(ago);
    const owner = users[lines[0][0]];
    const total = lines.reduce((n, [, , q]) => n + q * price, 0);
    const c = await db.groupCart.create({
      data: {
        code: newCartCode(randomBytes),
        name: `${owner.name}'s cart`,
        ownerId: owner.id,
        status: paid ? "DELIVERED" : "EXPIRED",
        minOrderValue: 50000,
        total,
        createdAt: at,
        expiresAt: addHours(at, 24),
        ...(paid
          ? {
              readyAt: addHours(at, 3),
              acceptedAt: addHours(at, 4),
              slipDueAt: addHours(at, 6),
              confirmedAt: addHours(at, 5),
              deliveryAddress: owner.address,
              deliveryCity: owner.city,
              deliveryLat: owner.lat,
              deliveryLng: owner.lng,
              deliveryPhone: owner.phone,
              delivery: { create: { provider: "manual", status: "DELIVERED", quotedFee: 850 } },
            }
          : { closedReason: "Expired" }),
        members: {
          create: [...new Set(lines.map((l) => l[0]))].map((i) => ({
            userId: users[i].id,
            joinedAt: at,
          })),
        },
        lines: {
          create: lines.map(([ui, size, qty], i) => ({
            userId: users[ui].id,
            variantId: shirtSize(size),
            qty,
            unitPrice: price,
            createdAt: addHours(at, i * 0.5),
          })),
        },
      },
    });
    if (paid)
      await db.packing.create({
        data: {
          cartId: c.id,
          gatheredById: kasun.id,
          gatheredAt: addHours(at, 6),
          packedById: ishara.id,
          packedAt: addHours(at, 7),
          handedOverById: ishara.id,
          handedOverAt: addHours(at, 8),
        },
      });
  };
  // The test: 21 of 24 bought in one cart at 2,400 (M and L sold out); 3 more wanted in a cart that expired.
  await shirtCart(
    18,
    2400,
    [
      [DILAN, "M", 4],
      [DILAN, "L", 4],
      [SACHINI, "M", 5],
      [SACHINI, "S", 2],
      [THARINDU, "L", 4],
      [THARINDU, "XL", 2],
    ],
    true,
  );
  await shirtCart(15, 2400, [[THARINDU, "M", 3]], false);
  // The bulk at 2,150: two paid carts, and one that expired.
  await shirtCart(
    4,
    2150,
    [
      [DILAN, "M", 8],
      [DILAN, "L", 6],
      [SACHINI, "S", 4],
      [SACHINI, "M", 6],
    ],
    true,
  );
  await shirtCart(
    2,
    2150,
    [
      [THARINDU, "L", 10],
      [THARINDU, "XL", 4],
      [THARINDU, "M", 10],
    ],
    true,
  );
  await shirtCart(1, 2150, [[SACHINI, "XL", 3]], false);

  // ─── A luxury brand (product owner, 2026-10-24): fictional, on a reserved .example domain ──
  // It publishes discounted products with the actual price, the discount price we buy at, the
  // pieces and the link to each on its own website. One is in our shop, one waits for review.
  const brand = await db.user.create({
    data: {
      role: "SELLER",
      isBrand: true,
      name: "Amaya Jayawardena",
      company: "Serendib Atelier",
      website: "https://www.serendib-atelier.example",
      email: "brand@example.com",
      phone: "0765555555",
      address: "18 Flower Road",
      city: "Colombo 07",
      lat: 6.9105,
      lng: 79.8577,
      passwordHash,
    },
  });
  const kaftanUrl = "https://www.serendib-atelier.example/products/linen-kaftan";
  const kaftan = await db.product.create({
    data: {
      title: "Hand-loomed linen kaftan",
      brand: "Serendib Atelier",
      category: "APPAREL",
      audience: "WOMEN",
      kind: "women-dresses",
      stockType: "FACTORY_SURPLUS",
      price: 11900,
      retailPrice: 18500,
      brandUrl: kaftanUrl,
      description: "Natural linen, hand-loomed. Last season's colours.",
      status: "LIVE",
      sellerId: brand.id,
      createdAt: daysAgo(3),
      variants: {
        create: [
          { size: "S", available: 12 },
          { size: "M", available: 14 },
          { size: "L", available: 10 },
        ],
      },
    },
  });
  for (const o of [
    {
      name: "Hand-loomed linen kaftan",
      description: "Natural linen, S to L. Last season's colours.",
      actualPrice: 18500,
      offerPrice: 9800,
      pieces: 36,
      productUrl: kaftanUrl,
      accepted: true,
      ago: 5,
    },
    {
      name: "Embroidered cotton blouse",
      description: "Hand embroidery, S to XL, ivory and sage.",
      actualPrice: 12900,
      offerPrice: 6500,
      pieces: 60,
      productUrl: "https://www.serendib-atelier.example/products/embroidered-blouse",
      accepted: false,
      ago: 0.2,
    },
  ])
    await db.stockOffer.create({
      data: {
        sellerId: brand.id,
        name: o.name,
        description: o.description,
        actualPrice: o.actualPrice,
        offerPrice: o.offerPrice,
        pieces: o.pieces,
        productUrl: o.productUrl,
        amount: o.offerPrice * o.pieces,
        status: o.accepted ? "ACCEPTED" : "IN_REVIEW",
        productId: o.accepted ? kaftan.id : null,
        createdAt: daysAgo(o.ago),
        decidedAt: o.accepted ? daysAgo(o.ago - 1) : null,
        receivedById: o.accepted ? kasun.id : null,
        receivedAt: o.accepted ? daysAgo(3) : null,
      },
    });

  // Seeded brand submissions use the same review history as newly submitted products.
  for (const offer of await db.stockOffer.findMany({ where: { sellerId: brand.id } })) {
    await db.brandOfferRevision.create({
      data: {
        offerId: offer.id,
        version: 1,
        status: offer.status,
        submittedById: brand.id,
        reviewedAt: offer.decidedAt,
        createdAt: offer.createdAt,
        snapshot: {
          name: offer.name,
          description: offer.description,
          actualPrice: offer.actualPrice?.toString() ?? null,
          offerPrice: offer.offerPrice?.toString() ?? null,
          pieces: offer.pieces,
          productUrl: offer.productUrl,
          photoKey: offer.photoKey,
          photoType: offer.photoType,
          packDetails: offer.packDetails,
          packSize: offer.packSize,
          dispatchDays: offer.dispatchDays,
          hasExpiry: offer.hasExpiry,
          expiryDate: offer.expiryDate?.toISOString() ?? null,
          minShelfLifeDays: offer.minShelfLifeDays,
        },
      },
    });
    if (offer.status === "ACCEPTED")
      await db.stockOffer.update({ where: { id: offer.id }, data: { approvedRevision: 1 } });
  }

  // Every other product starts its price history at its price (the dashboard charts it).
  await db.$executeRaw`
    INSERT INTO "PriceChange" ("id", "productId", "price", "at")
    SELECT 'pc_' || md5(random()::text || p."id"), p."id", p."price", p."createdAt"
    FROM "Product" p
    WHERE NOT EXISTS (SELECT 1 FROM "PriceChange" pc WHERE pc."productId" = p."id")`;

  console.log(`Seeded. Every password is password123.
  Admin   admin@groupbasket.lk  → /admin
  Seller  seller@example.com      → /seller (a tested linen shirt and its bulk)
  Brand   brand@example.com       → /seller (Serendib Atelier: a luxury brand's discounted products)
  Packing packer@example.com      → /packing (Kasun; packer2@example.com is Ishara)
  Buyers  buyer@example.com  (Dilan: public cart at 49,800, a delivered order, an invite)
          buyer2@example.com (Sachini: private cart at the minimum)
          buyer3@example.com (Tharindu: a paid order to gather, no active cart, free to join)
  Packing orders: Tharindu's to gather, Sachini's to pack, Dilan's for PickMe, plus one handed over`);
}

main().finally(() => db.$disconnect());
