import { execFileSync } from "node:child_process";
import { assertTestDatabase } from "../../scripts/test-database.mjs";

/** Each spec reseeds the test database so specs never depend on one another. */
export function seedBrowserFixtures() {
  const url = assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "seed"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
    timeout: 60_000,
  });
}
