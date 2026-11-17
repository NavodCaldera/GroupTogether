/**
 * Loads the material library from seeds/ into the database in DATABASE_URL (DEC-022).
 * Idempotent and safe on real data; see src/server/material-load.ts.
 *
 *   npm run materials:load                 new materials load as drafts
 *   npm run materials:load -- --publish    also publishes every draft (owner sign-off)
 */
import "dotenv/config";
import { readLibrary } from "../src/lib/materials/seed-files";
import { evidenceReport } from "../src/lib/materials/seed";
import { loadLibrary } from "../src/server/material-load";
import { db } from "../src/server/db";

async function main() {
  const lib = readLibrary();
  const publish = process.argv.includes("--publish");
  const n = await loadLibrary(db, lib, publish ? { publish: { by: null } } : {});
  console.log(
    `Loaded ${n.materials} materials, ${n.evidence} evidence rows, ${n.sources} sources; ` +
      `recomputed ${n.recomputed} product materials${publish ? "; drafts published" : ""}.`,
  );
  const r = evidenceReport(lib);
  if (r.unverified.length)
    console.log(`Evidence without a quote (stored, not used): ${r.unverified.join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
