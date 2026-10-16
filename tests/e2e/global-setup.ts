import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { config } from "dotenv";

/** Migrate and seed the dedicated test database (the seed empties it first). */
export default async function globalSetup() {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must be set and differ from DATABASE_URL");
  }
  const env = { ...process.env, DATABASE_URL: url, STORAGE_DIR: ".data/test-uploads" };
  rmSync(".data/test-uploads", { recursive: true, force: true });
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx prisma db seed", { env, stdio: "pipe" });
}
