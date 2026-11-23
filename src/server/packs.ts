import "server-only";
import { db } from "./db";

/** Family packs (DEC-030): categories → companies → standard packs → open baskets. */

const published = { publishedAt: { not: null } } as const;
const livePack = { active: true, versions: { some: published } } as const;

/** Home: every category that has a company with a published pack, companies under each. */
export async function homeCategories() {
  const rows = await db.category.findMany({
    where: { active: true, companies: { some: { active: true, packs: { some: livePack } } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      slug: true,
      name: true,
      companies: {
        where: { active: true, packs: { some: livePack } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { slug: true, name: true, demo: true, _count: { select: { packs: { where: livePack } } } },
      },
    },
  });
  return rows.map((c) => ({
    slug: c.slug,
    name: c.name,
    companies: c.companies.map((co) => ({ slug: co.slug, name: co.name, demo: co.demo, packs: co._count.packs })),
  }));
}
