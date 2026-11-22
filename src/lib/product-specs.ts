/**
 * Product.specs (DEC-029, CATG-002): product-level attribute values, checked with zod against the
 * category's resolved attributes (inherited from its ancestors). Variant axes are not specs: they
 * live on Variant.options. Values are stored typed: NUMBER as a number, BOOL as a boolean, TEXT and
 * ENUM as strings. No database.
 */
import { z } from "zod";
import type { CategoryAttributeNode } from "./categories";

export class SpecsError extends Error {}

export type SpecValue = string | number | boolean;
export type Specs = Record<string, SpecValue>;

const TRUE = new Set(["on", "true", "1", "yes"]);

/** The zod check for one attribute's raw form value ("" means not given). */
function fieldSchema(a: CategoryAttributeNode) {
  const name = a.label;
  const blank = z.literal("").transform(() => undefined);
  switch (a.type) {
    case "NUMBER": {
      const n = z
        .string()
        .trim()
        .regex(/^-?\d+(\.\d+)?$/, `Enter a number for ${name}`)
        .transform(Number)
        .refine((v) => Number.isFinite(v) && Math.abs(v) < 1e9, `Enter a number for ${name}`);
      return a.required ? n : z.union([blank, n]);
    }
    case "BOOL":
      // A checkbox: absent or "" is false.
      return z
        .string()
        .trim()
        .optional()
        .transform((v) => (v ? TRUE.has(v.toLowerCase()) : false));
    case "ENUM": {
      const values = a.options.map((o) => o.value);
      const e = z
        .string()
        .trim()
        .refine((v) => values.length === 0 || values.includes(v), `Choose a ${name.toLowerCase()}`)
        .refine((v) => v.length > 0 && v.length <= 60, `Choose a ${name.toLowerCase()}`);
      return a.required ? e : z.union([blank, e]);
    }
    default: {
      const t = z
        .string()
        .trim()
        .min(1, `Enter the ${name.toLowerCase()}`)
        .max(200, `${name} is too long`);
      return a.required ? t : z.union([blank, t]);
    }
  }
}

/** The zod schema for a category's specs: one optional-or-required field per product attribute. */
export function specsSchema(attributes: CategoryAttributeNode[]) {
  const shape: Record<string, z.ZodType<SpecValue | undefined>> = {};
  for (const a of attributes) {
    if (a.isVariantAxis) continue;
    const f = fieldSchema(a);
    // A missing required field reads as "" so the message names the attribute.
    shape[a.key] = z.preprocess((v) => (v === undefined && a.type !== "BOOL" ? "" : v), f);
  }
  return z.object(shape);
}

/** Stored specs as a plain object (anything malformed is dropped). Never throws. */
export function readSpecs(json: unknown): Specs {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: Specs = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>))
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  return out;
}

/**
 * Checks raw form values against the category's product attributes and returns the specs to store.
 * Keys in `stored` that the category does not have are kept (a category edit never rewrites stored
 * specs); keys in `raw` it does not have are ignored. Throws SpecsError with the first problem.
 */
export function parseSpecs(
  attributes: CategoryAttributeNode[],
  raw: Record<string, string>,
  stored?: unknown,
): Specs {
  const r = specsSchema(attributes).safeParse(raw);
  if (!r.success) throw new SpecsError(r.error.issues[0]?.message ?? "Check the details");
  const known = new Set(attributes.filter((a) => !a.isVariantAxis).map((a) => a.key));
  const out: Specs = {};
  for (const [k, v] of Object.entries(readSpecs(stored))) if (!known.has(k)) out[k] = v;
  for (const [k, v] of Object.entries(r.data)) if (v !== undefined) out[k] = v;
  return out;
}

/** A shop filter value typed for a JSON equality match, or undefined when it can't match. */
export function specFilterValue(a: CategoryAttributeNode, raw: string): SpecValue | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  if (a.type === "NUMBER") return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined;
  if (a.type === "BOOL") return TRUE.has(v.toLowerCase());
  return v.slice(0, 200);
}

/** A stored value for display: "80 pages", "Yes". */
export function specText(
  a: Pick<CategoryAttributeNode, "type" | "unit" | "options">,
  v: SpecValue,
) {
  if (a.type === "BOOL") return v ? "Yes" : "No";
  if (a.type === "ENUM") return a.options.find((o) => o.value === v)?.label ?? String(v);
  return a.unit ? `${v} ${a.unit}` : String(v);
}
