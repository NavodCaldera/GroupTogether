import { execSync } from "node:child_process";
import { config } from "dotenv";
import { assertTestDatabase } from "../../scripts/test-database.mjs";

/** Apply migrations to the test database once per run. */
export default function setup() {
  config({ quiet: true });
  const url = assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
