import "server-only";
import type { TokenKind } from "@/generated/prisma/client";
import { D, toD } from "@/lib/decimal";
import { db, type Tx } from "./db";

export async function tokenBalance(userId: string, tx: Tx = db): Promise<D> {
  const r = await tx.tokenEntry.aggregate({ where: { userId }, _sum: { amount: true } });
  return r._sum.amount === null ? new D(0) : toD(r._sum.amount);
}

/** Credits tokens once per `eventKey`; a repeat with the same key does nothing. */
export async function credit(
  tx: Tx,
  userId: string,
  amount: D,
  kind: TokenKind,
  eventKey: string,
  note: string,
) {
  if (!amount.gt(0) || amount.decimalPlaces() > 2) throw new Error("Invalid token amount");
  await tx.tokenEntry.createMany({
    data: [{ userId, amount: amount.toFixed(2), kind, eventKey, note }],
    skipDuplicates: true,
  });
}
