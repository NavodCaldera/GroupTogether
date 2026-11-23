import { db } from "@/server/db";

/** Empty every table and restore the settings row. */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0)
    await db.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} CASCADE`,
    );
  await db.settings.create({ data: { id: 1 } });
}

let n = 0;
/** A buyer with an address pin (central Colombo unless given). */
export async function makeBuyer({
  lat = 6.9271,
  lng = 79.8612,
}: { lat?: number; lng?: number } = {}) {
  n++;
  return db.user.create({
    data: {
      name: `User ${n}`,
      email: `u${n}-${Date.now()}@test.lk`,
      phone: `07${String(10000000 + n).slice(-8)}`,
      passwordHash: "x",
      address: "1 Test Rd",
      city: "Colombo",
      lat,
      lng,
    },
  });
}
