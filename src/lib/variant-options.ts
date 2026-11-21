/**
 * Variant options (DEC-029): a variant is any set of buyer choices, e.g. {size: "M", colour: "Navy"}
 * or {pages: "120", ruling: "single"}. Every write builds options, optionKey and label here; screens
 * and tickets show `label` and never format size or colour by hand. No database.
 */
import { compareSizes } from "@/lib/factory-insights";

export type VariantOptions = Record<string, string>;

/** Keys shown first, in this order; any others follow alphabetically. */
const LEAD_KEYS = ["size", "colour"];

const KEY = /^[a-z][a-z0-9_]{0,39}$/;
/** "|" and "=" build the option key, so values may not hold them. */
const VALUE = /^[^|=]{1,60}$/;

export class VariantOptionsError extends Error {}

/** Option names in display order. */
export function orderKeys(keys: Iterable<string>): string[] {
  const all = [...new Set(keys)];
  const lead = LEAD_KEYS.filter((k) => all.includes(k));
  return [...lead, ...all.filter((k) => !LEAD_KEYS.includes(k)).sort()];
}

/**
 * Checks options from a form or seed: keys lower-cased, values trimmed, empty values left out.
 * Throws VariantOptionsError on a bad name or value.
 */
export function cleanOptions(input: Record<string, unknown>): VariantOptions {
  const kept: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined) continue;
    const value = String(v).trim();
    if (!value) continue;
    const key = k.trim().toLowerCase();
    if (!KEY.test(key))
      throw new VariantOptionsError("Use letters, numbers or _ for an option name");
    if (!VALUE.test(value)) throw new VariantOptionsError("An option can't contain | or =");
    if (key in kept) throw new VariantOptionsError("Each option name can be used once");
    kept[key] = value;
  }
  const out: VariantOptions = {};
  for (const k of orderKeys(Object.keys(kept))) out[k] = kept[k];
  return out;
}

/** Checks a value from a form, returning the cleaned options or the first problem. */
export function parseOptions(
  input: unknown,
): { ok: true; options: VariantOptions } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, error: "Enter the options" };
  try {
    return { ok: true, options: cleanOptions(input as Record<string, unknown>) };
  } catch (e) {
    if (e instanceof VariantOptionsError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Reads a stored `Variant.options` value, dropping anything malformed. Never throws. */
export function readOptions(json: unknown): VariantOptions {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: VariantOptions = {};
  const entries = json as Record<string, unknown>;
  for (const k of orderKeys(Object.keys(entries))) {
    const v = entries[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** Normalised key: sorted lower-case trimmed key=value pairs joined by "|"; "" when there are none. */
export function optionKeyOf(options: VariantOptions): string {
  return Object.keys(options)
    .map((k) => [k.trim().toLowerCase(), String(options[k]).trim().toLowerCase()] as const)
    .filter(([, v]) => v)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

/** "M / Navy": the values in display order. "" when there are none. */
export function variantLabel(options: VariantOptions): string {
  return orderKeys(Object.keys(options))
    .map((k) => String(options[k] ?? "").trim())
    .filter(Boolean)
    .join(" / ");
}

/**
 * Options posted by a stock form: fields named `option.<name>`, plus the older `size` and `colour`
 * fields. Not yet checked: `variantFields` checks them.
 */
export function formOptions(fd: { entries(): Iterable<[string, unknown]> }): VariantOptions {
  const raw: VariantOptions = {};
  for (const [name, value] of fd.entries()) {
    if (typeof value !== "string") continue;
    if (name === "size" || name === "colour") raw[name] = value;
    else if (name.startsWith("option.")) raw[name.slice("option.".length)] = value;
  }
  return raw;
}

/** The size option of stored options ("" when there is none), for fit code (DEC-020). */
export function sizeOf(json: unknown): string {
  return readOptions(json).size ?? "";
}

/** The legacy size + colour pair as options. */
export function optionsFromSizeColour(size: string, colour = ""): VariantOptions {
  return cleanOptions({ size, colour });
}

/** Every stored column for a variant's options. */
export function variantFields(options: VariantOptions) {
  const clean = cleanOptions(options);
  return {
    options: clean,
    optionKey: optionKeyOf(clean),
    label: variantLabel(clean),
  };
}

/** Sorts one option's values: sizes small to large (S, M, L, XL), others in natural order. */
export function compareOptionValues(key: string, a: string, b: string): number {
  if (key === "size") return compareSizes(a, b);
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Sorts stored option sets: by each option in display order (sizes small to large). */
export function compareOptions(a: unknown, b: unknown): number {
  const x = readOptions(a);
  const y = readOptions(b);
  for (const key of orderKeys([...Object.keys(x), ...Object.keys(y)])) {
    if (x[key] === undefined || y[key] === undefined) {
      if (x[key] !== y[key]) return x[key] === undefined ? -1 : 1;
      continue;
    }
    const c = compareOptionValues(key, x[key], y[key]);
    if (c) return c;
  }
  return 0;
}

/**
 * The choices a product page offers: each option name present in the variants, in display order,
 * with its values sorted. `sizeOrder` (the category's own size order) wins for sizes when given.
 */
export function optionAxes(
  variants: { options: unknown }[],
  sizeOrder?: string[],
): { key: string; values: string[] }[] {
  const values = new Map<string, Set<string>>();
  for (const v of variants) {
    for (const [k, value] of Object.entries(readOptions(v.options))) {
      if (!values.has(k)) values.set(k, new Set());
      values.get(k)!.add(value);
    }
  }
  return orderKeys(values.keys()).map((key) => {
    const list = [...values.get(key)!];
    if (key === "size" && sizeOrder?.length) {
      const known = sizeOrder.filter((s) => list.includes(s));
      const rest = list.filter((s) => !sizeOrder.includes(s)).sort(compareSizes);
      return { key, values: [...known, ...rest] };
    }
    return { key, values: list.sort((a, b) => compareOptionValues(key, a, b)) };
  });
}

/** An option name as a heading: "size" → "Size", "volume_ml" → "Volume ml". */
export function optionName(key: string): string {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
