import "server-only";
import type { Settings } from "@/generated/prisma/client";
import { db, type Tx } from "./db";

/** The one settings row, created with the launch defaults the first time it is read. */
export async function getSettings(tx: Tx = db): Promise<Settings> {
  return (
    (await tx.settings.findUnique({ where: { id: 1 } })) ??
    (await tx.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }))
  );
}
