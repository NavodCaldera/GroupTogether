import { randomUUID } from "node:crypto";
import type { AgentStatus } from "@/generated/prisma/client";
import { db } from "@/server/db";

/** Empty every table and restore default settings. */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
  }
  await db.settings.create({ data: { id: 1 } });
}

let n = 0;
/** Admins default to the warehouse area; pass another area for premium or factory work. */
export async function makeUser(
  role: "CUSTOMER" | "ADMIN" | "PACKER" = "CUSTOMER",
  adminArea: "PREMIUM" | "FACTORY" | "WAREHOUSE" | "CORE" = "WAREHOUSE",
) {
  n++;
  return db.user.create({
    data: {
      role,
      adminArea: role === "ADMIN" ? adminArea : null,
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
      title: `Shirt ${++n}`,
      brand: "Test",
      category: "APPAREL",
      stockType: "FACTORY_SURPLUS",
      price,
      status: "LIVE",
      variants: { create: { size: "M", available } },
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

/** A factory account (SELLER with a profile) and a LIVE product: factory 1000 + 100 = 1100, 50 free. */
export async function makeFactory() {
  n++;
  const factory = await db.user.create({
    data: {
      role: "SELLER",
      name: `Factory ${n}`,
      email: `f${n}-${Date.now()}@test.lk`,
      phone: `07${String(20000000 + n).slice(-8)}`,
      passwordHash: "x",
      company: `Factory ${n}`,
      factoryProfile: { create: {} },
    },
  });
  const product = await db.product.create({
    data: {
      title: `Shirt ${n}`,
      brand: "Test",
      category: "APPAREL",
      stockType: "FACTORY_SURPLUS",
      price: "1100",
      factoryPrice: "1000",
      commission: "100",
      status: "LIVE",
      sellerId: factory.id,
      variants: { create: { size: "M", available: 50 } },
    },
    include: { variants: true },
  });
  return { factory, variant: product.variants[0] };
}

/** An agent user with a pin; status defaults to LIVE. */
export async function makeAgent({
  lat = 6.9271,
  lng = 79.8612,
  status = "LIVE",
}: { lat?: number; lng?: number; status?: AgentStatus } = {}) {
  n++;
  const user = await db.user.create({
    data: {
      role: "AGENT",
      name: `Agent ${n}`,
      email: `a${n}-${Date.now()}@test.lk`,
      phone: `07${String(30000000 + n).slice(-8)}`,
      passwordHash: "x",
      address: "1 Agent Rd",
      city: "Colombo",
      lat,
      lng,
    },
  });
  const agent = await db.agent.create({
    data: { userId: user.id, status, lat, lng, address: "1 Agent Rd", city: "Colombo" },
  });
  return { user, agent };
}

/** A buyer with a pin. */
export async function makeBuyer({ lat = 6.9271, lng = 79.8612 }: { lat?: number; lng?: number } = {}) {
  const user = await makeUser("CUSTOMER");
  return db.user.update({ where: { id: user.id }, data: { lat, lng } });
}

/** Give a user token balance with one ORDER_CANCEL entry. */
export async function fundTokens(userId: string, amount: string | number) {
  return db.tokenEntry.create({
    data: {
      userId,
      amount: String(amount),
      kind: "ORDER_CANCEL",
      eventKey: `test:${randomUUID()}`,
      note: "Test funding",
    },
  });
}
