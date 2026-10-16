import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClass?: typeof PrismaClient;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  // Prisma dev (PGlite) serves one connection at a time: set DATABASE_POOL_MAX=1 for it.
  const max = Number(process.env.DATABASE_POOL_MAX ?? 10);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
}

/**
 * In dev one client is kept on globalThis so hot reloads don't open new pools. After a migration
 * regenerates the client, the cached one would still reject new enum values and fields, so it is
 * replaced when the generated PrismaClient class has changed.
 */
function devClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (cached && globalForPrisma.prismaClass === PrismaClient) return cached;
  if (cached) void cached.$disconnect();
  globalForPrisma.prismaClass = PrismaClient;
  return (globalForPrisma.prisma = createClient());
}

export const db = process.env.NODE_ENV === "production" ? createClient() : devClient();

/** Transaction client type, for services that run inside `db.$transaction`. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;
