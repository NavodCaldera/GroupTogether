import { execFileSync } from "node:child_process";
import { assertTestDatabase } from "../../scripts/test-database.mjs";

/** Each serial spec owns its seed so brand checkout cannot consume buyer-journey fixtures. */
export function seedBrowserFixtures() {
  const url = assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "seed"], {
    env: { ...process.env, DATABASE_URL: url, STORAGE_DIR: ".data/test-uploads" },
    stdio: "pipe",
    timeout: 60_000,
  });
}
