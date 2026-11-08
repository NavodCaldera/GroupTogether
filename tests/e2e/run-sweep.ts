/**
 * Runs the cron sweep once against DATABASE_URL, as POST /api/cron/sweep does. Browser specs call
 * it through `runSweep()` in factory.spec.ts (with prisma/seed-hooks.mjs preloaded).
 */
import { db } from "../../src/server/db";
import { runSweep } from "../../src/server/sweep";

runSweep()
  .then((result) => console.log(JSON.stringify(result)))
  .finally(() => db.$disconnect());
