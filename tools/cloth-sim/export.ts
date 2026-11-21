/**
 * Writes the export that tools/cloth-sim/batch.py reads (DEC-021, Task 6.4): every product with an
 * approved size chart, as a cloth-sim job, and every standard shape that has a body file.
 *
 *   npx tsx --conditions=react-server tools/cloth-sim/export.ts OUT.json [--product ID | --title "Title"]
 *
 * Products for men or women are simulated on that gender's shapes, products without an audience
 * on all of them; children's products are left out (the standard shapes are adults).
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { Prisma } from "../../src/generated/prisma/client";
import { fitClass, readChart } from "../../src/lib/fit/data";
import { isShort } from "../../src/lib/fit/drape";
import {
  DEEP_FIT_MOTIONS,
  FIT_DATA_SELECT,
  fitDataHash,
  fitKind,
} from "../../src/server/deep-fit-jobs";
import { audienceOfSlug } from "../../src/lib/categories";

const genderOf = (a: string | null) => (a === "MEN" || a === "WOMEN" ? a : null);

export interface DrapeExport {
  products: {
    id: string;
    title: string;
    fitDataHash: string;
    /** The shapes to simulate on: "MEN", "WOMEN", or null for all. */
    gender: "MEN" | "WOMEN" | null;
    /** run.simulate's job without "body". */
    job: {
      cls: string;
      short: boolean;
      sizes: Record<string, Record<string, number>>;
      fabric: { gsm: number | null; stretch_pct: number | null; weave: string | null };
      motions: string[];
    };
  }[];
  /** Body files as paths on disk: `root`/public + the shape's bodyUrl. */
  archetypes: { name: string; gender: string; body: string }[];
}

export async function exportDrapeJobs(
  db: PrismaClient,
  { root, where = {} }: { root: string; where?: Prisma.ProductWhereInput },
): Promise<DrapeExport> {
  const [products, shapes] = await Promise.all([
    db.product.findMany({
      where: {
        ...where,
        fitApprovedAt: { not: null },
        sizeChart: { not: Prisma.DbNull },
        // Men's, women's and unisex garments: not girls', boys' or kids'.
        NOT: ["girl", "boy", "kid"].map((a) => ({
          categoryRef: { slug: { startsWith: `clothing/${a}/` } },
        })),
      },
      select: { id: true, title: true, ...FIT_DATA_SELECT },
      orderBy: { id: "asc" },
    }),
    db.bodyArchetype.findMany({
      where: { bodyUrl: { not: null } },
      select: { name: true, gender: true, bodyUrl: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    products: products.flatMap((p) => {
      const sizes = readChart(p.sizeChart) as Record<string, Record<string, number>>;
      if (!Object.keys(sizes).length) return [];
      return [
        {
          id: p.id,
          title: p.title,
          fitDataHash: fitDataHash(p),
          gender: genderOf(audienceOfSlug(p.categoryRef.slug)),
          job: {
            cls: fitClass(fitKind(p)),
            short: isShort(fitKind(p)),
            sizes,
            fabric: { gsm: p.gsm, stretch_pct: p.fabricStretchPct, weave: p.weave },
            motions: [...DEEP_FIT_MOTIONS],
          },
        },
      ];
    }),
    archetypes: shapes.map((a) => ({
      name: a.name,
      gender: a.gender,
      body: join(root, "public", a.bodyUrl!),
    })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const out = args[0];
  if (!out || out.startsWith("--"))
    throw new Error('Usage: export.ts OUT.json [--product ID | --title "Title"]');
  await import("dotenv/config");
  const { db } = await import("../../src/server/db");
  const where = opt("--product")
    ? { id: opt("--product") }
    : opt("--title")
      ? { title: opt("--title") }
      : {};
  const data = await exportDrapeJobs(db, { root: resolve("."), where });
  writeFileSync(out, JSON.stringify(data, null, 2));
  console.log(`Exported ${data.products.length} products and ${data.archetypes.length} shapes`);
  await db.$disconnect();
}

if (process.argv[1] && /export\.ts$/.test(process.argv[1])) void main();
