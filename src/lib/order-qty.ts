/**
 * Order quantity rule (DEC-029): a product sells in at least `minOrderQty` units, then in steps of
 * `stepQty` (a dozen pens: 12, 24, 36…). Checked per cart line on cart add and at checkout.
 * No database.
 */
export type QtyRule = { minOrderQty: number; stepQty: number };

const ok = (n: number) => Number.isInteger(n) && n >= 1;

/** The rule with any bad stored value read as 1. */
export function qtyRule(r: Partial<QtyRule> | null | undefined): QtyRule {
  return {
    minOrderQty: r?.minOrderQty !== undefined && ok(r.minOrderQty) ? r.minOrderQty : 1,
    stepQty: r?.stepQty !== undefined && ok(r.stepQty) ? r.stepQty : 1,
  };
}

/** Is `qty` (a positive whole number) allowed? */
export function qtyAllowed(qty: number, rule: Partial<QtyRule> | null | undefined): boolean {
  const { minOrderQty, stepQty } = qtyRule(rule);
  return Number.isInteger(qty) && qty >= minOrderQty && (qty - minOrderQty) % stepQty === 0;
}

/** The problem with `qty` for a product, or null when it is allowed. */
export function qtyProblem(
  qty: number,
  rule: Partial<QtyRule> | null | undefined,
  title = "this product",
): string | null {
  if (qtyAllowed(qty, rule)) return null;
  const { minOrderQty, stepQty } = qtyRule(rule);
  if (qty < minOrderQty) return `Order at least ${minOrderQty} of ${title}`;
  return `Order ${title} in steps of ${stepQty} from ${minOrderQty}`;
}

/** The nearest allowed quantity at or above `qty` (for steppers and the first add). */
export function snapQty(qty: number, rule: Partial<QtyRule> | null | undefined): number {
  const { minOrderQty, stepQty } = qtyRule(rule);
  if (!Number.isFinite(qty) || qty <= minOrderQty) return minOrderQty;
  return minOrderQty + Math.ceil((qty - minOrderQty) / stepQty) * stepQty;
}
