// Demo data: buyers near Kollupitiya, sample companies with packs, and two open baskets.
// Company names are examples only, not partners (`demo: true`). Wipes the database first.
import { DEMO_BUYERS, DEMO_COMPANY, DEMO_PASSWORD } from "../src/lib/demo-accounts";
import { hashPassword } from "../src/server/auth/password";
import { db } from "../src/server/db";

type Item = [name: string, size: string, qty: number];
type Pack = { price: string; size: number; items: Item[] };
type Company = { slug: string; name: string; logo: string; budget: Pack; premium: Pack };

// Every company has a Budget and a Premium pack, both 30 days, for a family of 4.
const CATALOGUE: { slug: string; name: string; companies: Company[] }[] = [
  {
    slug: "personal-care",
    name: "Personal Care",
    companies: [
      {
        slug: "hemas",
        name: "Hemas",
        logo: "/logos/hemas.png",
        budget: {
          price: "2450.00",
          size: 10,
          items: [
            ["Herbal soap", "100 g", 4],
            ["Toothpaste", "120 g", 1],
            ["Shampoo", "180 ml", 1],
          ],
        },
        premium: {
          price: "4600.00",
          size: 10,
          items: [
            ["Herbal soap", "100 g", 8],
            ["Toothpaste", "120 g", 2],
            ["Shampoo", "400 ml", 1],
            ["Coconut hair oil", "200 ml", 1],
          ],
        },
      },
    ],
  },
  {
    slug: "biscuits-snacks",
    name: "Biscuits & Snacks",
    companies: [
      {
        slug: "cbl",
        name: "CBL",
        logo: "/logos/cbl.png",
        budget: {
          price: "1900.00",
          size: 8,
          items: [
            ["Cream crackers", "490 g", 2],
            ["Marie biscuits", "400 g", 2],
          ],
        },
        premium: {
          price: "3200.00",
          size: 8,
          items: [
            ["Cream crackers", "490 g", 3],
            ["Chocolate biscuits", "200 g", 4],
            ["Wafers", "100 g", 3],
          ],
        },
      },
      {
        slug: "maliban",
        name: "Maliban",
        logo: "/logos/maliban.webp",
        budget: {
          price: "1850.00",
          size: 6,
          items: [
            ["Marie biscuits", "400 g", 2],
            ["Lemon puff", "200 g", 2],
          ],
        },
        premium: {
          price: "3400.00",
          size: 6,
          items: [
            ["Marie biscuits", "400 g", 3],
            ["Lemon puff", "200 g", 3],
            ["Chocolate cream", "200 g", 3],
          ],
        },
      },
    ],
  },
  {
    slug: "dairy",
    name: "Dairy",
    companies: [
      {
        slug: "pelwatte",
        name: "Pelwatte Dairy Industries",
        logo: "/logos/pelwatte.png",
        budget: {
          price: "3100.00",
          size: 12,
          items: [["Full cream milk powder", "400 g", 3]],
        },
        premium: {
          price: "5400.00",
          size: 12,
          items: [
            ["Full cream milk powder", "1 kg", 2],
            ["Butter", "200 g", 1],
          ],
        },
      },
    ],
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

  const versions = new Map<string, string>();
  for (const [order, cat] of CATALOGUE.entries()) {
    const category = await db.category.create({
      data: { slug: cat.slug, name: cat.name, sortOrder: order },
    });
    for (const co of cat.companies) {
      const company = await db.company.create({
        data: { slug: co.slug, name: co.name, logo: co.logo, categoryId: category.id, demo: true },
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
            groupSize: p.size,
            commissionPct: "10.00",
            householdSize: 4,
            items: {
              create: p.items.map(([name, size, qty], sortOrder) => ({
                name,
                size,
                qty,
                sortOrder,
              })),
            },
          },
        });
        versions.set(slug, v.id);
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

  /** An OPEN basket where the owner and members have paid. */
  async function basket(
    slug: string,
    ownerEmail: string,
    memberEmails: string[],
    daysLeft: number,
  ) {
    const owner = users.get(ownerEmail)!;
    const members = [owner, ...memberEmails.map((e) => users.get(e)!)];
    await db.packGroup.create({
      data: {
        versionId: versions.get(slug)!,
        createdById: owner.id,
        lat: owner.lat,
        lng: owner.lng,
        address: owner.address,
        city: owner.city,
        status: "OPEN",
        joined: members.length,
        closesAt: new Date(Date.now() + daysLeft * 86_400_000),
        members: { create: members.map((m) => ({ userId: m.id, status: "PAID" as const })) },
      },
    });
  }
  await basket("hemas-premium", DEMO_BUYERS.sachini, [DEMO_BUYERS.ravindu, DEMO_BUYERS.ayesha], 7);
  await basket("hemas-budget", DEMO_BUYERS.nimali, [], 12);
  // Nimali is in Dilan's contacts, so her basket is listed first for him.
  await db.userContact.create({
    data: { userId: users.get(DEMO_BUYERS.dilan)!.id, phone: "0771000004" },
  });

  console.log(`Seeded. Password for every demo buyer: ${DEMO_PASSWORD}`);
  console.log("  buyer@example.com: two Hemas baskets nearby (Nimali's first, a contact)");
  console.log(`  ${DEMO_COMPANY}: Hemas company dashboard at /company`);
  console.log("  buyer3@example.com: in Wellawatte with no basket nearby, can start one");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
