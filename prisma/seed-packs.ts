import { db } from "../src/server/db";
import { DEMO_BUYERS } from "../src/lib/demo-accounts";

/** Demo family packs (DEC-030). Company names are examples only, not partners. */

type Item = [name: string, size: string, qty: number];
type Pack = { slug: string; name: string; days: number; price: string; size: number; household?: number; items: Item[] };

const CATALOGUE: { slug: string; name: string; companies: { slug: string; name: string; packs: Pack[] }[] }[] = [
  {
    slug: "personal-care",
    name: "Personal Care",
    companies: [
      {
        slug: "hemas",
        name: "Hemas",
        packs: [
          {
            slug: "hemas-15-day",
            name: "15-day Family Pack",
            days: 15,
            price: "2450.00",
            size: 10,
            household: 4,
            items: [
              ["Herbal soap", "100 g", 4],
              ["Toothpaste", "120 g", 1],
              ["Shampoo", "180 ml", 1],
            ],
          },
          {
            slug: "hemas-30-day",
            name: "30-day Family Pack",
            days: 30,
            price: "4600.00",
            size: 10,
            household: 4,
            items: [
              ["Herbal soap", "100 g", 8],
              ["Toothpaste", "120 g", 2],
              ["Shampoo", "400 ml", 1],
              ["Coconut hair oil", "200 ml", 1],
            ],
          },
        ],
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
        packs: [
          {
            slug: "cbl-30-day",
            name: "30-day Snack Pack",
            days: 30,
            price: "3200.00",
            size: 8,
            items: [
              ["Cream crackers", "490 g", 3],
              ["Chocolate biscuits", "200 g", 4],
            ],
          },
        ],
      },
      {
        slug: "maliban",
        name: "Maliban",
        packs: [
          {
            slug: "maliban-15-day",
            name: "15-day Tea-time Pack",
            days: 15,
            price: "1850.00",
            size: 6,
            items: [
              ["Marie biscuits", "400 g", 2],
              ["Lemon puff", "200 g", 2],
            ],
          },
        ],
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
        packs: [
          {
            slug: "pelwatte-30-day",
            name: "30-day Milk Powder Pack",
            days: 30,
            price: "5400.00",
            size: 12,
            household: 4,
            items: [
              ["Full cream milk powder", "1 kg", 2],
              ["Butter", "200 g", 1],
            ],
          },
        ],
      },
    ],
  },
];

export async function seedFamilyPacks() {
  const versions = new Map<string, string>();
  let order = 100;
  for (const cat of CATALOGUE) {
    const category = await db.category.create({ data: { slug: cat.slug, name: cat.name, path: "/", sortOrder: order++ } });
    await db.category.update({ where: { id: category.id }, data: { path: `/${category.id}/` } });
    for (const co of cat.companies) {
      const company = await db.company.create({
        data: { slug: co.slug, name: co.name, categoryId: category.id, demo: true },
      });
      for (const p of co.packs) {
        const pack = await db.standardPack.create({
          data: { slug: p.slug, name: p.name, durationDays: p.days, companyId: company.id },
        });
        const v = await db.packVersion.create({
          data: {
            packId: pack.id,
            version: 1,
            publishedAt: new Date(),
            pricePerFamily: p.price,
            groupSize: p.size,
            commissionPct: "10.00",
            householdSize: p.household ?? null,
            items: { create: p.items.map(([name, size, qty], sortOrder) => ({ name, size, qty, sortOrder })) },
          },
        });
        versions.set(p.slug, v.id);
      }
    }
  }

  const buyers = await db.user.findMany({
    where: { email: { in: Object.values(DEMO_BUYERS) } },
    select: { id: true, email: true, lat: true, lng: true, address: true, city: true },
  });
  const by = new Map(buyers.map((b) => [b.email, b]));
  const day = 86_400_000;

  // A Hemas 30-day basket at 7 of 10 near Dilan, owned by Sachini; Tharindu has none nearby.
  async function basket(slug: string, ownerEmail: string, memberEmails: string[], daysLeft: number) {
    const owner = by.get(ownerEmail)!;
    const versionId = versions.get(slug)!;
    const members = [owner, ...memberEmails.map((e) => by.get(e)!)];
    await db.packGroup.create({
      data: {
        versionId,
        createdById: owner.id,
        lat: owner.lat ?? 6.9,
        lng: owner.lng ?? 79.86,
        address: owner.address ?? "Colombo",
        city: owner.city,
        status: "OPEN",
        joined: members.length,
        closesAt: new Date(Date.now() + daysLeft * day),
        members: { create: members.map((m) => ({ userId: m.id, status: "PAID" as const })) },
      },
    });
  }
  const near = [DEMO_BUYERS.nimali, DEMO_BUYERS.ravindu, DEMO_BUYERS.ayesha, DEMO_BUYERS.kasun, DEMO_BUYERS.dinithi];
  // Pin the basket's families next to Dilan so the basket is within 1 km of him.
  const dilan = by.get(DEMO_BUYERS.dilan)!;
  for (const [i, e] of [DEMO_BUYERS.sachini, ...near].entries()) {
    const b = by.get(e)!;
    const lat = (dilan.lat ?? 6.9) + 0.001 * (i + 1);
    await db.user.update({ where: { id: b.id }, data: { lat, lng: dilan.lng ?? 79.86 } });
    by.set(e, { ...b, lat, lng: dilan.lng ?? 79.86 });
  }
  await basket("hemas-30-day", DEMO_BUYERS.sachini, near, 7);
  await basket("hemas-15-day", DEMO_BUYERS.nimali, [DEMO_BUYERS.ravindu], 12);
}
