// Demo data: buyers near Kollupitiya, sample companies with packs, and two open baskets.
// Company names are examples only, not partners (`demo: true`). Wipes the database first.
import { DEMO_BUYERS, DEMO_COMPANY, DEMO_PASSWORD } from "../src/lib/demo-accounts";
import { type BasketSize, itemCosts, packAmountDue, sizePrice } from "../src/lib/pack-money";
import { hashPassword } from "../src/server/auth/password";
import { db } from "../src/server/db";

// Item: name, size, quantity for the family, sample shop price for one unit.
type Item = [name: string, size: string, qty: number, retail: string];
type Pack = { price: string; items: Item[] };
// Kept cold, so never resold.
const CHILLED = new Set([
  "Butter",
  "Chicken meatballs",
  "Chicken sausages",
  "Fresh milk",
  "Pork bacon",
  "Pre-cooked chicken",
  "Set yoghurt",
  "Vanilla ice cream",
  "Whole chicken",
]);
// Discount % for baskets of 5, 10 and 15 families.
const DISCOUNTS = {
  budget: { discount5: "5.00", discount10: "8.00", discount15: "10.00" },
  premium: { discount5: "6.00", discount10: "10.00", discount15: "15.00" },
};
type Company = { slug: string; name: string; logo?: string; budget: Pack; premium: Pack };

// Every company has a Budget and a Premium pack, both 30 days, for a family of 4.
// Listed on the home page in this order. Pack contents and prices are samples.
const COMPANIES: Company[] = [
  {
    slug: "cbl",
    name: "CBL Group",
    logo: "/logos/cbl.png",
    budget: {
      price: "1900.00",
      items: [
        ["Cream crackers", "490 g", 2, "520.00"],
        ["Marie biscuits", "400 g", 2, "390.00"],
      ],
    },
    premium: {
      price: "3200.00",
      items: [
        ["Cream crackers", "490 g", 3, "520.00"],
        ["Chocolate biscuits", "200 g", 4, "320.00"],
        ["Wafers", "100 g", 3, "220.00"],
      ],
    },
  },
  {
    slug: "maliban",
    name: "Maliban Group",
    logo: "/logos/maliban.webp",
    budget: {
      price: "1850.00",
      items: [
        ["Marie biscuits", "400 g", 2, "390.00"],
        ["Lemon puff", "200 g", 2, "280.00"],
      ],
    },
    premium: {
      price: "3400.00",
      items: [
        ["Marie biscuits", "400 g", 3, "390.00"],
        ["Lemon puff", "200 g", 3, "280.00"],
        ["Chocolate cream", "200 g", 3, "300.00"],
      ],
    },
  },
  {
    slug: "hemas",
    name: "Hemas Consumer Brands",
    logo: "/logos/hemas.png",
    budget: {
      price: "2450.00",
      items: [
        ["Herbal soap", "100 g", 4, "140.00"],
        ["Toothpaste", "120 g", 1, "260.00"],
        ["Shampoo", "180 ml", 1, "690.00"],
      ],
    },
    premium: {
      price: "4600.00",
      items: [
        ["Herbal soap", "100 g", 8, "140.00"],
        ["Toothpaste", "120 g", 2, "260.00"],
        ["Shampoo", "400 ml", 1, "1350.00"],
        ["Coconut hair oil", "200 ml", 1, "450.00"],
      ],
    },
  },
  {
    slug: "renuka",
    name: "Renuka Foods",
    budget: {
      price: "2200.00",
      items: [
        ["Coconut milk powder", "300 g", 2, "640.00"],
        ["Coconut milk", "400 ml", 2, "450.00"],
      ],
    },
    premium: {
      price: "4100.00",
      items: [
        ["Coconut milk powder", "300 g", 4, "640.00"],
        ["Coconut milk", "400 ml", 3, "450.00"],
        ["Virgin coconut oil", "500 ml", 1, "1250.00"],
      ],
    },
  },
  {
    slug: "sunshine",
    name: "Sunshine Consumer Lanka",
    budget: { price: "1700.00", items: [["Black tea", "200 g", 2, "900.00"]] },
    premium: {
      price: "3300.00",
      items: [
        ["Black tea", "400 g", 2, "1700.00"],
        ["Green tea bags", "50 bags", 1, "650.00"],
      ],
    },
  },
  {
    slug: "harischandra",
    name: "Harischandra Mills",
    budget: {
      price: "2000.00",
      items: [
        ["Noodles", "400 g", 3, "330.00"],
        ["Coffee", "100 g", 1, "1100.00"],
      ],
    },
    premium: {
      price: "3800.00",
      items: [
        ["Noodles", "400 g", 5, "330.00"],
        ["Coffee", "200 g", 1, "2100.00"],
        ["Soya meat", "90 g", 4, "160.00"],
      ],
    },
  },
  {
    slug: "wijaya",
    name: "Wijaya Products",
    budget: {
      price: "1500.00",
      items: [
        ["Chilli powder", "250 g", 1, "620.00"],
        ["Curry powder", "250 g", 1, "580.00"],
        ["Turmeric powder", "100 g", 1, "350.00"],
      ],
    },
    premium: {
      price: "2900.00",
      items: [
        ["Chilli powder", "500 g", 1, "1180.00"],
        ["Curry powder", "500 g", 1, "1100.00"],
        ["Turmeric powder", "100 g", 1, "350.00"],
        ["Black pepper", "100 g", 1, "520.00"],
      ],
    },
  },
  {
    slug: "raigam",
    name: "Kingdom of Raigam",
    budget: {
      price: "1100.00",
      items: [
        ["Table salt", "1 kg", 2, "180.00"],
        ["Soya meat", "90 g", 5, "160.00"],
      ],
    },
    premium: {
      price: "2300.00",
      items: [
        ["Table salt", "1 kg", 2, "180.00"],
        ["Soya meat", "90 g", 8, "160.00"],
        ["Instant noodles", "75 g", 10, "110.00"],
      ],
    },
  },
  {
    slug: "lanka-canneries",
    name: "Lanka Canneries",
    budget: {
      price: "1600.00",
      items: [
        ["Mixed fruit jam", "500 g", 1, "780.00"],
        ["Fruit cordial", "750 ml", 1, "900.00"],
      ],
    },
    premium: {
      price: "3100.00",
      items: [
        ["Mixed fruit jam", "500 g", 2, "780.00"],
        ["Fruit cordial", "750 ml", 2, "900.00"],
        ["Tomato sauce", "400 g", 1, "520.00"],
      ],
    },
  },
  {
    slug: "edinborough",
    name: "Edinborough Products",
    budget: {
      price: "1300.00",
      items: [
        ["Custard powder", "300 g", 1, "620.00"],
        ["Jelly crystals", "100 g", 3, "240.00"],
      ],
    },
    premium: {
      price: "2500.00",
      items: [
        ["Custard powder", "300 g", 2, "620.00"],
        ["Jelly crystals", "100 g", 4, "240.00"],
        ["Vanilla essence", "28 ml", 1, "380.00"],
      ],
    },
  },
  {
    slug: "cw-mackie",
    name: "C.W. Mackie",
    budget: {
      price: "2700.00",
      items: [
        ["Coconut oil", "1 l", 1, "980.00"],
        ["Red dhal", "1 kg", 2, "890.00"],
      ],
    },
    premium: {
      price: "5200.00",
      items: [
        ["Coconut oil", "1 l", 2, "980.00"],
        ["Red dhal", "1 kg", 3, "890.00"],
        ["Rice", "5 kg", 1, "1150.00"],
      ],
    },
  },
  {
    slug: "swadeshi",
    name: "Swadeshi Industrial Works",
    budget: {
      price: "1200.00",
      items: [
        ["Herbal soap", "100 g", 6, "160.00"],
        ["Baby soap", "75 g", 2, "190.00"],
      ],
    },
    premium: {
      price: "2400.00",
      items: [
        ["Herbal soap", "100 g", 10, "160.00"],
        ["Baby soap", "75 g", 4, "190.00"],
        ["Sandalwood soap", "100 g", 2, "220.00"],
      ],
    },
  },
  {
    slug: "multichemi",
    name: "Multichemi International",
    budget: {
      price: "1400.00",
      items: [
        ["Dishwash liquid", "500 ml", 2, "420.00"],
        ["Toilet cleaner", "500 ml", 1, "650.00"],
      ],
    },
    premium: {
      price: "2800.00",
      items: [
        ["Dishwash liquid", "500 ml", 3, "420.00"],
        ["Toilet cleaner", "500 ml", 2, "650.00"],
        ["Floor cleaner", "1 l", 1, "780.00"],
      ],
    },
  },
  {
    slug: "pelwatte",
    name: "Pelwatte Dairy Industries",
    logo: "/logos/pelwatte.png",
    budget: { price: "3100.00", items: [["Full cream milk powder", "400 g", 3, "1220.00"]] },
    premium: {
      price: "5400.00",
      items: [
        ["Full cream milk powder", "1 kg", 2, "2950.00"],
        ["Butter", "200 g", 1, "780.00"],
      ],
    },
  },
  {
    slug: "lanka-milk-foods",
    name: "Lanka Milk Foods",
    budget: { price: "2900.00", items: [["Milk powder", "400 g", 3, "1150.00"]] },
    premium: {
      price: "5600.00",
      items: [
        ["Milk powder", "1 kg", 2, "2800.00"],
        ["Malted drink", "400 g", 1, "1050.00"],
      ],
    },
  },
  {
    slug: "milco",
    name: "Milco",
    budget: {
      price: "3000.00",
      items: [
        ["Milk powder", "400 g", 2, "1180.00"],
        ["Fresh milk", "1 l", 2, "600.00"],
      ],
    },
    premium: {
      price: "5900.00",
      items: [
        ["Milk powder", "1 kg", 2, "2850.00"],
        ["Fresh milk", "1 l", 2, "600.00"],
        ["Set yoghurt", "80 g", 8, "90.00"],
      ],
    },
  },
  {
    slug: "ceylon-cold-stores",
    name: "Ceylon Cold Stores",
    budget: {
      price: "2100.00",
      items: [
        ["Soft drink", "1.5 l", 3, "450.00"],
        ["Vanilla ice cream", "1 l", 1, "1100.00"],
      ],
    },
    premium: {
      price: "4000.00",
      items: [
        ["Soft drink", "1.5 l", 5, "450.00"],
        ["Vanilla ice cream", "1 l", 2, "1100.00"],
        ["Chicken sausages", "500 g", 1, "980.00"],
      ],
    },
  },
  {
    slug: "cic",
    name: "CIC Holdings",
    budget: {
      price: "2600.00",
      items: [
        ["Rice", "5 kg", 1, "1150.00"],
        ["Eggs", "10 eggs", 2, "650.00"],
      ],
    },
    premium: {
      price: "4900.00",
      items: [
        ["Rice", "5 kg", 2, "1150.00"],
        ["Eggs", "10 eggs", 3, "650.00"],
        ["Set yoghurt", "80 g", 8, "90.00"],
      ],
    },
  },
  {
    slug: "ruhunu-foods",
    name: "Ruhunu Foods",
    budget: {
      price: "1400.00",
      items: [
        ["Curry powder", "250 g", 1, "560.00"],
        ["Chilli pieces", "250 g", 1, "600.00"],
        ["Cinnamon", "50 g", 1, "320.00"],
      ],
    },
    premium: {
      price: "2700.00",
      items: [
        ["Curry powder", "500 g", 1, "1080.00"],
        ["Chilli pieces", "250 g", 1, "600.00"],
        ["Cinnamon", "50 g", 2, "320.00"],
        ["Cardamom", "25 g", 1, "650.00"],
      ],
    },
  },
  {
    slug: "marina-foods",
    name: "Marina Foods",
    budget: {
      price: "1300.00",
      items: [
        ["Coconut cream", "400 ml", 2, "480.00"],
        ["Coconut water", "330 ml", 2, "220.00"],
      ],
    },
    premium: {
      price: "2600.00",
      items: [
        ["Coconut cream", "400 ml", 3, "480.00"],
        ["Coconut water", "330 ml", 4, "220.00"],
        ["Desiccated coconut", "250 g", 1, "420.00"],
      ],
    },
  },
  {
    slug: "uswatte",
    name: "Uswatte Confectionery Works",
    budget: {
      price: "1000.00",
      items: [
        ["Toffees", "200 g", 2, "320.00"],
        ["Wafers", "100 g", 2, "210.00"],
      ],
    },
    premium: {
      price: "2000.00",
      items: [
        ["Toffees", "200 g", 3, "320.00"],
        ["Wafers", "100 g", 3, "210.00"],
        ["Chocolate bar", "100 g", 3, "260.00"],
      ],
    },
  },
  {
    slug: "finagle",
    name: "Finagle Lanka",
    budget: {
      price: "1500.00",
      items: [
        ["Sandwich bread", "450 g", 3, "260.00"],
        ["Tea buns", "6 buns", 2, "380.00"],
      ],
    },
    premium: {
      price: "2900.00",
      items: [
        ["Sandwich bread", "450 g", 5, "260.00"],
        ["Tea buns", "6 buns", 3, "380.00"],
        ["Butter cake", "500 g", 1, "650.00"],
      ],
    },
  },
  {
    slug: "pussalla",
    name: "Pussalla Meat Producers",
    budget: {
      price: "3400.00",
      items: [
        ["Chicken sausages", "500 g", 2, "940.00"],
        ["Chicken meatballs", "500 g", 2, "880.00"],
      ],
    },
    premium: {
      price: "6500.00",
      items: [
        ["Chicken sausages", "500 g", 3, "940.00"],
        ["Chicken meatballs", "500 g", 3, "880.00"],
        ["Pork bacon", "200 g", 2, "760.00"],
      ],
    },
  },
  {
    slug: "bairaha",
    name: "Bairaha Farms",
    budget: {
      price: "4200.00",
      items: [
        ["Whole chicken", "1 kg", 2, "1650.00"],
        ["Chicken sausages", "500 g", 1, "950.00"],
      ],
    },
    premium: {
      price: "8000.00",
      items: [
        ["Whole chicken", "1 kg", 3, "1650.00"],
        ["Chicken sausages", "500 g", 2, "950.00"],
        ["Pre-cooked chicken", "400 g", 2, "1200.00"],
      ],
    },
  },
  {
    slug: "natures-beauty-creations",
    name: "Nature’s Beauty Creations",
    budget: {
      price: "1800.00",
      items: [
        ["Herbal face wash", "100 ml", 1, "650.00"],
        ["Body lotion", "200 ml", 1, "850.00"],
        ["Herbal soap", "100 g", 2, "180.00"],
      ],
    },
    premium: {
      price: "3500.00",
      items: [
        ["Herbal face wash", "100 ml", 2, "650.00"],
        ["Body lotion", "400 ml", 1, "1500.00"],
        ["Herbal soap", "100 g", 4, "180.00"],
      ],
    },
  },
  {
    slug: "antler",
    name: "Antler Industries",
    budget: {
      price: "1600.00",
      items: [
        ["Washing powder", "1 kg", 1, "780.00"],
        ["Bar soap", "120 g", 4, "190.00"],
      ],
    },
    premium: {
      price: "3100.00",
      items: [
        ["Washing powder", "2 kg", 1, "1500.00"],
        ["Bar soap", "120 g", 6, "190.00"],
        ["Fabric softener", "1 l", 1, "620.00"],
      ],
    },
  },
];

// Kollupitiya, 100 m apart going north; Tharindu lives in Wellawatte, too far from both baskets.
const KOLLUPITIYA = { lat: 6.9115, lng: 79.8505 };
const BUYERS = [
  { email: DEMO_BUYERS.dilan, name: "Dilan Wickramasinghe", phone: "0771000001" },
  { email: DEMO_BUYERS.sachini, name: "Sachini Gunawardena", phone: "0771000002" },
  {
    email: DEMO_BUYERS.tharindu,
    name: "Tharindu Senanayake",
    phone: "0771000003",
    at: { lat: 6.8747, lng: 79.8605, city: "Wellawatte" },
  },
  { email: DEMO_BUYERS.nimali, name: "Nimali Jayasuriya", phone: "0771000004" },
  { email: DEMO_BUYERS.ravindu, name: "Ravindu Bandara", phone: "0771000005" },
  { email: DEMO_BUYERS.ayesha, name: "Ayesha Nazeer", phone: "0771000006" },
];

async function main() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} CASCADE`,
  );
  await db.settings.create({ data: { id: 1 } });

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = new Map<
    string,
    { id: string; lat: number; lng: number; address: string; city: string }
  >();
  for (const [i, b] of BUYERS.entries()) {
    const at = b.at ?? {
      lat: KOLLUPITIYA.lat + 0.0009 * i,
      lng: KOLLUPITIYA.lng,
      city: "Kollupitiya",
    };
    const address = `${10 + i} Galle Road`;
    const u = await db.user.create({
      data: { email: b.email, name: b.name, phone: b.phone, passwordHash, address, ...at },
    });
    users.set(b.email, { id: u.id, address, ...at });
  }

  const versions = new Map<string, Awaited<ReturnType<typeof db.packVersion.create>>>();
  for (const [order, co] of COMPANIES.entries()) {
    {
      const company = await db.company.create({
        data: { slug: co.slug, name: co.name, logo: co.logo, sortOrder: order, demo: true },
      });
      for (const [kind, p] of [
        ["budget", co.budget],
        ["premium", co.premium],
      ] as const) {
        const slug = `${co.slug}-${kind}`;
        const pack = await db.standardPack.create({
          data: {
            slug,
            name: kind === "budget" ? "Budget Pack" : "Premium Pack",
            durationDays: 30,
            companyId: company.id,
          },
        });
        const v = await db.packVersion.create({
          data: {
            packId: pack.id,
            version: 1,
            publishedAt: new Date(),
            pricePerFamily: p.price,
            ...DISCOUNTS[kind],
            commissionPct: "10.00",
            householdSize: 4,
            items: {
              create: p.items.map(([name, size, qty, retailPrice], sortOrder) => ({
                name,
                size,
                qty,
                retailPrice,
                chilled: CHILLED.has(name),
                sortOrder,
              })),
            },
          },
        });
        versions.set(slug, v);
      }
    }
  }

  const hemas = await db.company.findUniqueOrThrow({
    where: { slug: "hemas" },
    select: { id: true },
  });
  await db.user.create({
    data: { email: DEMO_COMPANY, name: "Hemas", passwordHash, companyId: hemas.id },
  });

  /** A basket of `size` families where the owner and members have paid; FULL places the order. */
  async function basket(
    slug: string,
    size: BasketSize,
    ownerEmail: string,
    memberEmails: string[],
    daysLeft: number,
    status: "OPEN" | "FULL" = "OPEN",
  ) {
    const owner = users.get(ownerEmail)!;
    const members = [owner, ...memberEmails.map((e) => users.get(e)!)];
    const v = versions.get(slug)!;
    const price = sizePrice(v, size).toFixed(2);
    return db.packGroup.create({
      data: {
        versionId: versions.get(slug)!.id,
        size,
        price,
        createdById: owner.id,
        lat: owner.lat,
        lng: owner.lng,
        address: owner.address,
        city: owner.city,
        status,
        joined: members.length,
        closesAt: new Date(Date.now() + daysLeft * 86_400_000),
        members: {
          create: members.map((m) => ({
            userId: m.id,
            status: "PAID" as const,
            paidAt: new Date(),
          })),
        },
        ...(status === "FULL"
          ? {
              delivery: {
                create: {
                  companyId: (await db.standardPack.findUniqueOrThrow({ where: { slug } }))
                    .companyId,
                  families: size,
                  amountDue: packAmountDue(price, v.commissionPct, size).toFixed(2),
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        lat: true,
        lng: true,
        city: true,
        members: { select: { id: true, userId: true } },
      },
    });
  }
  await basket(
    "hemas-premium",
    10,
    DEMO_BUYERS.sachini,
    [DEMO_BUYERS.ravindu, DEMO_BUYERS.ayesha],
    7,
  );
  await basket("hemas-budget", 5, DEMO_BUYERS.nimali, [], 12);
  // Nimali is in Dilan's contacts, so her basket is listed first for him.
  await db.userContact.create({
    data: { userId: users.get(DEMO_BUYERS.dilan)!.id, phone: "0771000004" },
  });

  // A CBL basket that filled and was ordered; Sachini resells some of her share.
  const cbl = await basket(
    "cbl-budget",
    5,
    DEMO_BUYERS.sachini,
    [DEMO_BUYERS.dilan, DEMO_BUYERS.nimali, DEMO_BUYERS.ravindu, DEMO_BUYERS.ayesha],
    0,
    "FULL",
  );
  const cblItems = await db.packItem.findMany({
    where: { versionId: versions.get("cbl-budget")!.id },
    orderBy: { sortOrder: "asc" },
  });
  const costs = itemCosts(sizePrice(versions.get("cbl-budget")!, 5), cblItems)!;
  const sachini = users.get(DEMO_BUYERS.sachini)!;
  const tharindu = users.get(DEMO_BUYERS.tharindu)!;
  const share = cbl.members.find((m) => m.userId === sachini.id)!;
  for (const [i, audience, spot] of [
    [0, "BOTH", "Liberty Plaza main entrance"],
    [1, "CONTACTS", "Kollupitiya railway station"],
  ] as const) {
    await db.resaleListing.create({
      data: {
        sellerId: sachini.id,
        memberId: share.id,
        itemId: cblItems[i].id,
        qty: 1,
        unitPrice: costs[i].unit.toFixed(2),
        audience,
        spot,
        city: cbl.city,
        lat: cbl.lat,
        lng: cbl.lng,
      },
    });
  }
  // Sachini and Tharindu saved each other's numbers, so he sees her contacts-only listing.
  await db.userContact.createMany({
    data: [
      { userId: sachini.id, phone: "0771000003" },
      { userId: tharindu.id, phone: "0771000002" },
    ],
  });

  console.log(`Seeded. Password for every demo buyer: ${DEMO_PASSWORD}`);
  console.log("  buyer@example.com: two Hemas baskets nearby (Nimali's first, a contact)");
  console.log(`  ${DEMO_COMPANY}: Hemas company dashboard at /company`);
  console.log("  buyer3@example.com: in Wellawatte with no basket nearby, can start one");
  console.log("  Sachini resells two CBL items: one to contacts and nearby, one to contacts only");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
