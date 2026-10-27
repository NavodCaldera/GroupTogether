import "server-only";
import { z } from "zod";
import { D } from "@/lib/decimal";
import { colomboDay, colomboDayStart } from "@/lib/format";
import { lotPrice, reduceAtFor } from "@/lib/stock-rules";
import { CatalogueError } from "./catalogue";
import { db, type Tx } from "./db";
import { logPrices } from "./prices";
import { getSettings } from "./settings";

/**
 * Bulk lots (product owner, 2026-10-21). An admin enters what a bulk cost (bulk, transport,
 * wages), its pieces and the day it reached our store; products listed from it are priced at
 * cost + 20% and drop to cost + 10% seven days after it arrived. The margins and days come from
 * Settings and are snapshotted on the lot. Rules: `src/lib/stock-rules.ts`.
 */

const DAY_MS = 86_400_000;

const amount = (message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, message));

const optionalAmount = (message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, "") || "0")
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, message));

export const lotSchema = z.object({
  name: z.string().trim().min(2, "Enter a name for the lot").max(120),
  pieces: z.coerce
    .number({ message: "Enter the number of pieces" })
    .int("Enter whole pieces")
    .min(1, "Enter the number of pieces")
    .max(1_000_000, "That's too many pieces"),
  bulkCost: amount("Enter the bulk cost, such as 900000").refine(
    (v) => /^\d+(\.\d{1,2})?$/.test(v) && new D(v).gt(0),
    "Enter the bulk cost, such as 900000",
  ),
  transportCost: optionalAmount("Enter the transport cost as a number"),
  wages: optionalAmount("Enter the wages as a number"),
  receivedOn: z.string().trim(),
});

/** Creates or updates a lot and prices its products for `now`. */
export async function saveLot(id: string | null, input: unknown, now = new Date()) {
  const l = lotSchema.parse(input);
  const receivedAt = colomboDay(l.receivedOn);
  if (!receivedAt) throw new CatalogueError("Pick the day the bulk arrived");
  if (receivedAt > colomboDayStart(now)) throw new CatalogueError("Pick today or an earlier day");
  const data = {
    name: l.name,
    pieces: l.pieces,
    bulkCost: l.bulkCost,
    transportCost: l.transportCost,
    wages: l.wages,
    receivedAt,
  };

  return db.$transaction(async (tx) => {
    let margins: { fullMarginPct: number; reducedMarginPct: number; fullMarginDays: number };
    let reducedAt: Date | null = null;
    if (id) {
      const old = await tx.lot.findUnique({ where: { id } });
      if (!old) throw new CatalogueError("This lot no longer exists");
      // An edit keeps the margins and days the lot started with.
      margins = {
        fullMarginPct: old.fullMarginPct,
        reducedMarginPct: old.reducedMarginPct,
        fullMarginDays: Math.round((old.reduceAt.getTime() - old.receivedAt.getTime()) / DAY_MS),
      };
      reducedAt = old.reducedAt;
    } else {
      margins = await getSettings(tx);
    }
    const reduceAt = reduceAtFor(receivedAt, margins.fullMarginDays);
    const snapshot = {
      ...data,
      fullMarginPct: margins.fullMarginPct,
      reducedMarginPct: margins.reducedMarginPct,
      reduceAt,
      reducedAt: reduceAt <= now ? (reducedAt ?? now) : null,
    };
    const lot = id
      ? await tx.lot.update({ where: { id }, data: snapshot })
      : await tx.lot.create({ data: snapshot });
    await tx.product.updateMany({ where: { lotId: lot.id }, data: { price: lotPrice(lot, now) } });
    await logPrices(tx, await lotProductIds(tx, lot.id), now);
    return lot;
  });
}

/**
 * Moves lots whose full-margin days are over to the reduced price. Runs from `sweep()` (page
 * loads and the cron), so prices drop on time without a worker; one indexed query when none is due.
 * Carts keep the price each line was added at.
 */
export async function reduceDueLots(now = new Date()) {
  const due = await db.lot.findMany({
    where: { reducedAt: null, reduceAt: { lte: now } },
    take: 50,
  });
  for (const lot of due) {
    await db.$transaction(async (tx) => {
      const r = await tx.lot.updateMany({
        where: { id: lot.id, reducedAt: null },
        data: { reducedAt: now },
      });
      if (r.count === 0) return;
      await tx.product.updateMany({
        where: { lotId: lot.id },
        data: { price: lotPrice(lot, now) },
      });
      await logPrices(tx, await lotProductIds(tx, lot.id), now);
    });
  }
  return { reduced: due.length };
}

async function lotProductIds(tx: Tx, lotId: string) {
  const rows = await tx.product.findMany({ where: { lotId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Lots for the product form's picker, newest arrival first. */
export function lotChoices() {
  return db.lot.findMany({
    select: { id: true, name: true, receivedAt: true },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });
}
