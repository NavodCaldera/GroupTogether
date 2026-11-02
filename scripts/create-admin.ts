/**
 * Creates an area admin from the command line. There is no unrestricted admin (ADMIN-002), so
 * this is how a new deployment gets its first premium, factory and warehouse admins; after that
 * each area adds its own admins in Admin → Users → Add admin.
 *
 *   npm run admin:create -- PREMIUM "Name" email@example.com 0771234567
 *
 * Prints a random temporary password to hand over privately.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ADMIN_AREAS, type OperationalAdminArea } from "../src/lib/admin-access";
import { hashPassword } from "../src/server/auth/password";

const [area, name, rawEmail, rawPhone] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
const phone = rawPhone?.replace(/[\s-]/g, "").replace(/^\+94/, "0");
if (
  !ADMIN_AREAS.includes(area as OperationalAdminArea) ||
  !name?.trim() ||
  !email?.includes("@") ||
  !/^07\d{8}$/.test(phone ?? "")
) {
  console.error(
    `Usage: npm run admin:create -- <${ADMIN_AREAS.join("|")}> "Name" email 07XXXXXXXX`,
  );
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  if (await db.user.count({ where: { OR: [{ email }, { phone }] } })) {
    throw new Error("An account with this email or mobile number already exists");
  }
  const password = randomBytes(9).toString("base64url");
  await db.user.create({
    data: {
      role: "ADMIN",
      adminArea: area as OperationalAdminArea,
      name: name.trim(),
      email,
      phone,
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Created ${area} admin ${email}. Temporary password: ${password}`);
}

main()
  .catch((e: Error) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
