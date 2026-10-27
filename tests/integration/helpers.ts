import { db } from "@/server/db";

/** Empty every table and restore default settings (50,000 minimum, 24h, 2h). */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
  }
  await db.settings.create({ data: { id: 1, accountNumber: "123" } });
}

let n = 0;
export async function makeUser(role: "CUSTOMER" | "ADMIN" | "PACKER" = "CUSTOMER") {
  n++;
  return db.user.create({
    data: {
      role,
      name: `User ${n}`,
      email: `u${n}-${Date.now()}@test.lk`,
      phone: `07${String(10000000 + n).slice(-8)}`,
      passwordHash: "x",
      address: "1 Test Rd",
      city: "Colombo",
      lat: 6.9271,
      lng: 79.8612,
    },
  });
}

/** A live product with one size holding `available` free units. */
export async function makeVariant(price: string, available: number) {
  const p = await db.product.create({
    data: {
      title: `Shoe ${++n}`,
      brand: "Test",
      category: "SHOES",
      stockType: "FACTORY_SURPLUS",
      price,
      status: "LIVE",
      variants: { create: { size: "UK 9", available } },
    },
    include: { variants: true },
  });
  return p.variants[0];
}

export const variantRow = (id: string) => db.variant.findUniqueOrThrow({ where: { id } });
export const cartRow = (id: string) => db.groupCart.findUniqueOrThrow({ where: { id } });

export function slipFile() {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "slip.jpg", { type: "image/jpeg" });
}

export function giftPhotoFile() {
  return new File(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    "gift.png",
    { type: "image/png" },
  );
}
