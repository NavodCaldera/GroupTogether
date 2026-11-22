import { db } from "../src/server/db";
import { DEMO_AGENTS, DEMO_BUYERS } from "../src/lib/demo-accounts";

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
            householdSize: p.household ?? null,
            items: { create: p.items.map(([name, size, qty], sortOrder) => ({ name, size, qty, sortOrder })) },
          },
        });
        versions.set(p.slug, v.id);
      }
    }
  }

  const agent = (email: string) =>
    db.agent.findFirstOrThrow({ where: { user: { email } }, select: { id: true } });
  const kollupitiya = await agent(DEMO_AGENTS.kollupitiya);
  const wellawatte = await agent(DEMO_AGENTS.wellawatte);
  const buyers = await db.user.findMany({
    where: { email: { in: Object.values(DEMO_BUYERS) } },
    select: { id: true, email: true },
  });
  const byEmail = new Map(buyers.map((b) => [b.email, b.id]));
  const id = (email: string) => byEmail.get(email)!;

  // Dilan sees a Kollupitiya group at 7 of 10 to join; Tharindu at Wellawatte sees Start a group.
  await db.user.updateMany({
    where: { id: { in: buyers.map((b) => b.id) } },
    data: { pickupAgentId: kollupitiya.id },
  });
  await db.user.update({ where: { id: id(DEMO_BUYERS.tharindu) }, data: { pickupAgentId: wellawatte.id } });

  const members = [
    DEMO_BUYERS.sachini,
    DEMO_BUYERS.nimali,
    DEMO_BUYERS.ravindu,
    DEMO_BUYERS.ayesha,
    DEMO_BUYERS.kasun,
    DEMO_BUYERS.dinithi,
  ].map(id);
  const starter = members[0];
  const closesAt = new Date(Date.now() + 7 * 86_400_000);
  // Six demo buyers and one more demo family make 7 of 10.
  const extra = await db.user.create({
    data: {
      name: "Demo Family",
      email: "family7@example.com",
      passwordHash: (await db.user.findUniqueOrThrow({ where: { id: starter }, select: { passwordHash: true } }))
        .passwordHash,
      pickupAgentId: kollupitiya.id,
    },
  });
  await db.packGroup.create({
    data: {
      versionId: versions.get("hemas-30-day")!,
      agentId: kollupitiya.id,
      createdById: starter,
      joined: 7,
      closesAt,
      members: { create: [...members, extra.id].map((userId) => ({ userId })) },
    },
  });
  // Same pickup point, other pack: its progress is its own.
  await db.packGroup.create({
    data: {
      versionId: versions.get("hemas-15-day")!,
      agentId: kollupitiya.id,
      createdById: starter,
      joined: 2,
      members: { create: members.slice(0, 2).map((userId) => ({ userId })) },
    },
  });
}
