import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { config } from "dotenv";
import { assertTestDatabase } from "../../scripts/test-database.mjs";

/** Migrate the dedicated test database; each serial spec owns its seed. */
export default async function globalSetup() {
  config({ quiet: true });
  const url = assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  const env = { ...process.env, DATABASE_URL: url, STORAGE_DIR: ".data/test-uploads" };
  rmSync(".data/test-uploads", { recursive: true, force: true });
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
}
