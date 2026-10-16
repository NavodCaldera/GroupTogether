/**
 * Demo data: 1 admin, 1 factory seller, 6 buyers, about 20 products, and carts in several
 * states. Every account's password is "password123". Resets the database first.
 *
 *   admin@grouptogether.lk  admin       → /admin
 *   seller@example.com      seller      → /seller (Ceylon Footwear Mills)
 *   buyer@example.com       buyer       → /dashboard (an open cart, a delivered order, an invite)
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
  defect?: string;
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
    defect: "Small glue marks on the midsole; uneven stitching on one heel tab.",
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
    defect: "Faint print misalignment on the side logo.",
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
    defect: "Colour shade differs slightly between left and right shoe.",
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
    defect: "Scuff on the toe box, sole fully intact.",
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
    defect: "One button slightly off-centre; small dye spot inside the hem.",
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
    defect: "Uneven wash on the back panel.",
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
    defect: "Embroidered logo slightly crooked.",
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
      accountName: "GroupTogether (Pvt) Ltd",
      accountNumber: "1000 2345 6789",
    },
  });

  const passwordHash = await hashPassword("password123");
  await db.user.create({
    data: {
      role: "ADMIN",
      name: "Admin",
      email: "admin@grouptogether.lk",
      phone: "0700000000",
      passwordHash,
    },
  });
  const people = [
    ["Amaya Perera", "amaya@example.com", "0771111111", "12 Flower Rd", "Colombo 07"],
    ["Kasun Silva", "kasun@example.com", "0772222222", "45 Galle Rd", "Dehiwala"],
    ["Nimali Fernando", "nimali@example.com", "0773333333", "8 Temple Ln", "Kandy"],
    ["Ravi Kumar", "ravi@example.com", "0774444444", "201 High Level Rd", "Nugegoda"],
    ["Ishara Jayasinghe", "ishara@example.com", "0775555555", "3 Lake Dr", "Kurunegala"],
  ];
  const users: User[] = [];
  for (const [name, email, phone, address, city] of people) {
    users.push(await db.user.create({ data: { name, email, phone, address, city, passwordHash } }));
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
        defectNotes: p.defect ?? null,
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
    name: string,
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
        name,
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

  await cart(0, "Office sneaker run", [
    [0, 2, 2],
    [1, 8, 1],
    [2, 40, 3],
  ]);
  await cart(1, "Family school shoes", [
    [1, 50, 4],
    [3, 52, 2],
    [4, 66, 3],
  ]);
  await cart(2, "Kandy weekend haul", [
    [2, 0, 3],
    [3, 30, 2],
    [4, 76, 3],
    [0, 90, 2],
  ]);
  const ravisCart = await cart(3, "Ravi's friends only", [[3, 12, 1]], {}, "PRIVATE");

  // ─── Demo buyer: an open cart, a delivered order and an invite ───────────
  const buyer = await db.user.create({
    data: {
      name: "Dilan Wickramasinghe",
      email: "buyer@example.com",
      phone: "0777777777",
      address: "27 Ward Pl",
      city: "Colombo 07",
      passwordHash,
    },
  });
  users.push(buyer);
  const BUYER = users.length - 1;
  /** An unused variant priced 3,000+ with enough free stock for `qty`. */
  const pick = (qty: number) => {
    const i = variants.findIndex((v, n) => !used.has(n) && v.price >= 3000 && v.available >= qty);
    if (i < 0) throw new Error("seed: no variant with enough stock");
    used.add(i);
    return i;
  };
  await cart(BUYER, "Dilan's office team", [
    [BUYER, pick(2), 2],
    [1, pick(1), 1],
  ]);
  await db.cartInvite.create({
    data: { cartId: ravisCart.id, invitedById: users[3].id, invitedUserId: buyer.id },
  });

  // A past order that went all the way: paid, confirmed and delivered by PickMe.
  const vi = variants.findIndex(
    (v, n) => !used.has(n) && v.available * v.price >= 45000 && v.price >= 3000,
  );
  if (vi < 0) throw new Error("seed: no variant for the delivered order");
  used.add(vi);
  const qty = Math.min(variants[vi].available, Math.ceil(45000 / variants[vi].price));
  const vj = pick(2);
  const lines: [number, number, number][] = [
    [BUYER, vi, qty],
    [2, vj, 2],
  ];
  const total = lines.reduce((n, [, v, q]) => n + variants[v].price * q, 0);
  const past = addHours(now, -30);
  await db.groupCart.create({
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
      deliveryPhone: buyer.phone,
      members: { create: [{ userId: buyer.id }, { userId: users[2].id }] },
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

  // ─── Demo factory seller: one product live, one in review, one returned ──
  const seller = await db.user.create({
    data: {
      role: "SELLER",
      name: "Nuwan Rajapaksha",
      company: "Ceylon Footwear Mills",
      email: "seller@example.com",
      phone: "0776666666",
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
    {
      title: "Ladies block-heel sandal",
      kind: "women-sandals",
      audience: "WOMEN",
      status: "IN_REVIEW",
      price: 3900,
      retailPrice: 8900,
      stockType: "B_GRADE",
      defectNotes: "Small glue marks on the inner strap; not visible when worn",
      reviewNote: null,
    },
    {
      title: "Kids school sneaker",
      kind: "boy-shoes",
      audience: "BOY",
      status: "DRAFT",
      price: 2800,
      retailPrice: null,
      stockType: "FACTORY_SURPLUS",
      reviewNote: "Please add a photo and the sizes you can send this week.",
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
        defectNotes: "defectNotes" in p ? p.defectNotes : null,
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

  console.log(`Seeded. Every password is password123.
  Admin   admin@grouptogether.lk  → /admin
  Seller  seller@example.com      → /seller
  Buyer   buyer@example.com       → /dashboard
  (also amaya@, kasun@, nimali@, ravi@, ishara@example.com)`);
}

main().finally(() => db.$disconnect());
