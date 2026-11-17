/**
 * Loads a fit simulation manifest (pipeline.py output) for one product (DEC-020): copies the
 * glTF files to the asset host, then upserts archetypes, the product's fit data, its
 * `FitAsset` rows and its `GarmentRegionTension` rows in one transaction.
 *
 *   npx tsx tools/fit-simulation/load.ts OUT_DIR (--product ID | --title "Title")
 *       [--assets-dir public/fit-assets] [--base-url /fit-assets] [--approve]
 *   npx tsx tools/fit-simulation/load.ts --drapes OUT_DIR [--assets-dir …] [--base-url …]
 *
 * `--drapes` loads a cloth-sim batch (tools/cloth-sim/batch.py, DEC-021): simulated tensions and
 * one garment file per standard shape × size, per product.
 *
 * Files are named by content hash, so the host may cache them forever (next.config.ts sets
 * that for /fit-assets). With an outside CDN, copy OUT_DIR there and pass its --base-url.
 */
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { MotionClip, PrismaClient } from "../../src/generated/prisma/client";
import { readBody } from "../../src/lib/fit/data";
import { isRegion, REGION_ENUM } from "../../src/lib/fit/regions";
import { closestArchetype, matchParams } from "../../src/lib/fit/report";
import { FIT_DATA_SELECT, fitDataHash } from "../../src/server/deep-fit-jobs";

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
 * Makes the standard shapes exactly these (seed/clusters.json, clusters.py): upserts each by
 * name, removes shapes not in the list, and re-picks the nearest shape for buyers whose shape
 * was removed.
 */
export async function loadArchetypes(db: PrismaClient, archetypes: FitManifest["archetypes"]) {
  return db.$transaction(async (tx) => {
    for (const a of archetypes)
      await tx.bodyArchetype.upsert({
        where: { name: a.name },
        create: { name: a.name, gender: a.gender, params: a.params },
        update: { gender: a.gender, params: a.params },
      });
    const { count } = await tx.bodyArchetype.deleteMany({
      where: { name: { notIn: archetypes.map((a) => a.name) } },
    });
    if (!count) return;
    const shapes = (
      await tx.bodyArchetype.findMany({ select: { id: true, gender: true, params: true } })
    ).map((a) => ({ ...a, params: matchParams(a.params) }));
    const lost = await tx.bodyProfile.findMany({
      where: { archetypeId: null },
      select: { id: true, heightCm: true, gender: true, measurements: true },
    });
    for (const p of lost) {
      const body = readBody(p.measurements);
      const near = closestArchetype(
        {
          height: p.heightCm,
          chest: body.chest?.value,
          waist: body.waist?.value,
          hip: body.hip?.value,
        },
        shapes,
        p.gender,
      );
      if (near)
        await tx.bodyProfile.update({ where: { id: p.id }, data: { archetypeId: near.id } });
    }
  });
}

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

/** tools/cloth-sim/batch.py's manifest.json; garment paths are relative to its folder. */
export interface DrapeManifest {
  products: {
    id: string;
    /** fitDataHash of the product's fit data the batch simulated. */
    fitDataHash: string;
    drapes: {
      archetype: string;
      size: string;
      tension: Record<string, number>;
      /** null when the size blew up or timed out ("unstable"). */
      garment: string | null;
      note?: string;
    }[];
  }[];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const safeName = (s: string) => s.replace(/[^A-Za-z0-9.+-]/g, "_");

/**
 * Loads a cloth-sim batch: per product, in one transaction, the simulated tensions replace the
 * standard shapes' `GarmentRegionTension` rows (note "simulated") and a `ClusterDrape` row points
 * at each size's garment, copied to `<assetsDir>/drapes` under a content-hash name. A product
 * whose fit data changed since the batch is skipped, as is a size that did not simulate.
 */
export async function loadDrapes(
  db: PrismaClient,
  outDir: string,
  { assetsDir, baseUrl }: { assetsDir: string; baseUrl: string },
) {
  const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8")) as DrapeManifest;
  const base = `${baseUrl.replace(/\/$/, "")}/drapes`;
  const target = join(assetsDir, "drapes");
  const loaded: { productId: string; drapes: number; tensions: number }[] = [];
  const skipped: { productId: string; reason: string }[] = [];
  for (const p of manifest.products) {
    const usable = p.drapes.filter((d) => d.garment && d.note !== "unstable");
    // Content-hash names: unchanged files keep their URL and may be cached forever.
    const urls = new Map<(typeof usable)[number], string>();
    for (const d of usable) {
      const bytes = readFileSync(join(outDir, d.garment!));
      const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
      const file = `${safeName(d.archetype)}-${safeName(d.size)}-${hash}.glb`;
      urls.set(d, `${base}/${file}`);
      mkdirSync(target, { recursive: true });
      if (!existsSync(join(target, file)))
        copyFileSync(join(outDir, d.garment!), join(target, file));
    }
    const reason = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: p.id }, select: FIT_DATA_SELECT });
      if (!product) return "product not found";
      if (fitDataHash(product) !== p.fitDataHash) return "fit data changed";
      const shapes = await tx.bodyArchetype.findMany({
        where: { name: { in: [...new Set(p.drapes.map((d) => d.archetype))] } },
        select: { id: true, name: true },
      });
      const ids = new Map(shapes.map((a) => [a.name, a.id]));
      const missing = p.drapes.find((d) => !ids.has(d.archetype));
      if (missing) return `unknown standard shape ${missing.archetype}`;
      await tx.clusterDrape.deleteMany({
        where: { productId: p.id, archetypeId: { in: [...ids.values()] } },
      });
      await tx.clusterDrape.createMany({
        data: usable.map((d) => ({
          productId: p.id,
          archetypeId: ids.get(d.archetype)!,
          size: d.size,
          garmentUrl: urls.get(d)!,
          fitDataHash: p.fitDataHash,
        })),
      });
      let tensions = 0;
      for (const d of usable)
        for (const [region, t] of Object.entries(d.tension)) {
          if (!isRegion(region) || !Number.isFinite(t)) continue;
          const key = {
            productId: p.id,
            archetypeId: ids.get(d.archetype)!,
            size: d.size,
            region: REGION_ENUM[region],
          };
          await tx.garmentRegionTension.upsert({
            where: { productId_archetypeId_size_region: key },
            create: { ...key, baseTension: clamp01(t), note: "simulated" },
            update: { baseTension: clamp01(t), note: "simulated" },
          });
          tensions++;
        }
      loaded.push({ productId: p.id, drapes: usable.length, tensions });
      return null;
    });
    if (reason) skipped.push({ productId: p.id, reason });
  }
  return { loaded, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const out = args[0];
  const bodies = opt("--bodies");
  const drapes = opt("--drapes");
  if (!bodies && !drapes && (!out || (!opt("--product") && !opt("--title"))))
    throw new Error(
      "Usage: load.ts OUT_DIR (--product ID | --title TITLE) [--approve] | load.ts --bodies DIR | load.ts --drapes DIR",
    );
  await import("dotenv/config");
  const { db } = await import("../../src/server/db");
  if (drapes) {
    const n = await loadDrapes(db, drapes, {
      assetsDir: resolve(opt("--assets-dir") ?? "public/fit-assets"),
      baseUrl: opt("--base-url") ?? "/fit-assets",
    });
    for (const l of n.loaded)
      console.log(`Loaded ${l.drapes} drapes and ${l.tensions} tension rows for ${l.productId}`);
    for (const s of n.skipped) console.log(`Skipped ${s.productId}: ${s.reason}`);
    await db.$disconnect();
    return;
  }
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
