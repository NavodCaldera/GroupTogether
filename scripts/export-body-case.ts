/**
 * Saves a consenting volunteer's capture as a case for the body accuracy test (DEC-021):
 *
 *   npx tsx scripts/export-body-case.ts <email> --name <label> --chest <cm> --waist <cm> --hip <cm>
 *
 * Run it after the volunteer saves their photos and before they press "Looks like me" (that
 * clears the outlines). Writes tools/body-fitting/cases/<label>.json, which git ignores.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { exportBodyCase } from "../src/server/body-fit-jobs";

async function main() {
  const [email, ...rest] = process.argv.slice(2);
  const flag = (name: string) => rest[rest.indexOf(`--${name}`) + 1];
  const tape = {
    chest: Number(flag("chest")),
    waist: Number(flag("waist")),
    hip: Number(flag("hip")),
  };
  const name = flag("name");
  if (
    !email ||
    !name ||
    !/^[\w-]+$/.test(name) ||
    Object.values(tape).some((v) => !(v > 30 && v < 250))
  )
    throw new Error(
      "Usage: export-body-case.ts <email> --name <label> --chest <cm> --waist <cm> --hip <cm>",
    );
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const dir = join(process.cwd(), "tools", "body-fitting", "cases");
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${name}.json`);
    await writeFile(file, JSON.stringify(await exportBodyCase(db, email, tape)));
    console.log(`wrote ${file}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(String(error.message ?? error));
  process.exitCode = 1;
});
