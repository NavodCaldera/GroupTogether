import "server-only";
import { db } from "../db";
import { D, toD } from "@/lib/decimal";
/** Read projection only: the stored payment snapshot is never rewritten by cancellations. */
export async function visibleTotals<T extends { id: string; total: { toString(): string } }>(
  rows: T[],
) {
  const lines = await db.cartLine.findMany({
    where: { cartId: { in: rows.map((r) => r.id) }, status: "CANCELLED" },
    select: { cartId: true, qty: true, unitPrice: true },
  });
  const removed = new Map<string, D>();
  for (const l of lines)
    removed.set(
      l.cartId,
      (removed.get(l.cartId) ?? new D("0")).plus(toD(l.unitPrice).times(l.qty)),
    );
  return rows.map((row) => ({
    ...row,
    total: D.max("0", toD(row.total).minus(removed.get(row.id) ?? "0")),
  }));
}

export async function cancelledValue(
  where: import("@/generated/prisma/client").Prisma.GroupCartWhereInput,
) {
  const lines = await db.cartLine.findMany({
    where: { status: "CANCELLED", cart: where },
    select: { qty: true, unitPrice: true },
  });
  return lines.reduce((sum, l) => sum.plus(toD(l.unitPrice).times(l.qty)), new D("0"));
}
