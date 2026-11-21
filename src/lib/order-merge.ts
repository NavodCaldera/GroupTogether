import { D } from "./decimal";
import { orderStage } from "./order-stage";

type Mergeable = {
  id: string;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  tokensApplied: { toString(): string };
  amountDue: { toString(): string };
  lines: unknown[];
  basket: { id: string; kind: string; status: string } | null;
};

/** One card per own basket (owner, 2026-11-21): a buyer's payments into the same own basket at the
 * same stage are joined into the newest order (its id and link), with every line, the amounts
 * summed and the first payment's date. Agent orders stay one card each. Keeps the input order. */
export function oneCardPerBasket<T extends Mergeable>(orders: T[]): T[] {
  const out: T[] = [];
  const at = new Map<string, number>();
  for (const o of orders) {
    const key = o.basket?.kind === "OWN" ? `${o.basket.id}:${orderStage(o as never)}` : null;
    const i = key === null ? undefined : at.get(key);
    if (i === undefined) {
      if (key !== null) at.set(key, out.length);
      out.push(o);
      continue;
    }
    const m = out[i]!;
    out[i] = {
      ...m,
      lines: [...m.lines, ...o.lines],
      tokensApplied: new D(m.tokensApplied.toString()).plus(o.tokensApplied.toString()),
      amountDue: new D(m.amountDue.toString()).plus(o.amountDue.toString()),
      createdAt: o.createdAt < m.createdAt ? o.createdAt : m.createdAt,
    };
  }
  return out;
}
