/**
 * Loads a fit simulation manifest (pipeline.py output) for one product (DEC-020): copies the
 * glTF files to the asset host, then upserts archetypes, the product's fit data, its
 * `FitAsset` rows and its `GarmentRegionTension` rows in one transaction.
 *
 *   npx tsx tools/fit-simulation/load.ts OUT_DIR (--product ID | --title "Title")
 *       [--assets-dir public/fit-assets] [--base-url /fit-assets] [--approve]
 *
 * Files are named by content hash, so the host may cache them forever (next.config.ts sets
 * that for /fit-assets). With an outside CDN, copy OUT_DIR there and pass its --base-url.
 */
import { cpSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { MotionClip, PrismaClient } from "../../src/generated/prisma/client";
import { isRegion, REGION_ENUM } from "../../src/lib/fit/regions";

export interface FitManifest {
  garment: {
    fabric: {
      stretch_pct: number;
      gsm?: number;
      weave?: string;
      thermal_min_c?: number;
      thermal_max_c?: number;
      breathability?: number;
      care_notes?: string;
    };
    size_chart: Record<string, Record<string, number>>;
  };
  archetypes: { name: string; gender: string; params: Record<string, number> }[];
  assets: { archetype: string; motion: string; file: string }[];
  tensions: { archetype: string; size: string; region: string; base: number; note: string }[];
}

const MOTIONS = ["WALK", "RUN", "REACH", "SIT"] as const;

/**
 * Points standard shapes at their Anny body files (tools/fit-simulation/anny_bodies.py writes
 * the files and `bodies.json`, name → file). Shapes not named keep what they have.
 */
export async function loadBodyFiles(
  db: PrismaClient,
  files: Record<string, string>,
  baseUrl: string,
) {
  for (const [name, file] of Object.entries(files))
    await db.bodyArchetype.updateMany({ where: { name }, data: { bodyUrl: `${baseUrl}/${file}` } });
}

export async function loadFitManifest(
  db: PrismaClient,
  manifest: FitManifest,
  productId: string,
  { baseUrl, approve = false }: { baseUrl: string; approve?: boolean },
) {
  const f = manifest.garment.fabric;
  return db.$transaction(async (tx) => {
    const ids = new Map<string, string>();
    for (const a of manifest.archetypes) {
      const row = await tx.bodyArchetype.upsert({
        where: { name: a.name },
        create: { name: a.name, gender: a.gender, params: a.params },
        update: { gender: a.gender, params: a.params },
        select: { id: true },
      });
      ids.set(a.name, row.id);
    }
    await tx.product.update({
      where: { id: productId },
      data: {
        sizeChart: manifest.garment.size_chart,
        fabricStretchPct: f.stretch_pct,
        gsm: f.gsm ?? null,
        weave: f.weave ?? null,
        thermalMinC: f.thermal_min_c ?? null,
        thermalMaxC: f.thermal_max_c ?? null,
        breathability: f.breathability ?? null,
        careNotes: f.care_notes ?? null,
        ...(approve ? { fitApprovedAt: new Date() } : {}),
      },
    });
    await tx.fitAsset.deleteMany({ where: { productId } });
    await tx.garmentRegionTension.deleteMany({ where: { productId } });
    await tx.fitAsset.createMany({
      data: manifest.assets
        .filter((a) => (MOTIONS as readonly string[]).includes(a.motion))
        .map((a) => ({
          productId,
          archetypeId: ids.get(a.archetype)!,
          motion: a.motion as MotionClip,
          gltfUrl: `${baseUrl.replace(/\/$/, "")}/${a.file}`,
        })),
    });
    await tx.garmentRegionTension.createMany({
      data: manifest.tensions
        .filter((t) => isRegion(t.region))
        .map((t) => ({
          productId,
          archetypeId: ids.get(t.archetype)!,
          size: t.size,
          region: REGION_ENUM[t.region as keyof typeof REGION_ENUM],
          baseTension: Math.min(1, Math.max(0, t.base)),
          note: t.note,
        })),
    });
    return { assets: manifest.assets.length, tensions: manifest.tensions.length };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const out = args[0];
  const bodies = opt("--bodies");
  if (!bodies && (!out || (!opt("--product") && !opt("--title"))))
    throw new Error(
      "Usage: load.ts OUT_DIR (--product ID | --title TITLE) [--approve] | load.ts --bodies DIR",
    );
  await import("dotenv/config");
  const { db } = await import("../../src/server/db");
  if (bodies) {
    // Standard body files written by anny_bodies.py into public/fit-assets/<DIR name>.
    const files = JSON.parse(readFileSync(join(bodies, "bodies.json"), "utf8"));
    await loadBodyFiles(
      db,
      files,
      `${opt("--base-url") ?? "/fit-assets"}/${basename(resolve(bodies))}`,
    );
    console.log(`Pointed ${Object.keys(files).length} standard shapes at their body files`);
    await db.$disconnect();
    return;
  }
  const product = await db.product.findFirstOrThrow({
    where: opt("--product") ? { id: opt("--product") } : { title: opt("--title") },
    select: { id: true },
  });
  const assetsDir = resolve(opt("--assets-dir") ?? "public/fit-assets");
  const name = basename(resolve(out));
  const target = join(assetsDir, name);
  if (resolve(out) !== target) cpSync(out, target, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) as FitManifest;
  const n = await loadFitManifest(db, manifest, product.id, {
    baseUrl: `${opt("--base-url") ?? "/fit-assets"}/${name}`,
    approve: args.includes("--approve"),
  });
  console.log(`Loaded ${n.assets} assets and ${n.tensions} tension rows for ${product.id}`);
  await db.$disconnect();
}

if (process.argv[1] && /load\.ts$/.test(process.argv[1])) void main();
