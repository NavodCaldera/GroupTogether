/** Fit data parsing and garment-kind rules (DEC-020). No database. */
import { z } from "zod";
import { sizesFor } from "@/lib/taxonomy";
import type { FitClass } from "./config";
import type { Body, Measure, SizeChart } from "./report";
import { isRegion, REGION_LABEL, REGIONS, type Region } from "./regions";

const BOTTOMS = /trousers|jeans|shorts|skirts|bottoms/;

/** Which ideal-ease table a category uses (./config.ts EASE). */
export function fitClass(kind: string | null | undefined): FitClass {
  if (kind && BOTTOMS.test(kind)) return "bottom";
  if (kind && /dresses/.test(kind)) return "dress";
  if (kind && /jackets/.test(kind)) return "outer";
  return "top";
}

/** Garment areas a factory measures for a category. */
export function kindRegions(kind: string | null | undefined): Region[] {
  if (kind && BOTTOMS.test(kind)) return ["waist", "hip", "thigh"];
  if (kind && /dresses/.test(kind)) return ["chest", "waist", "hip", "shoulder", "torso"];
  return ["chest", "waist", "shoulder", "upperArm", "torso"];
}

/** Sizes smallest first: the category's own order, then any others by first appearance. */
export function sizeOrder(kind: string | null | undefined, sizes: string[]): string[] {
  const known = sizesFor(kind ?? undefined);
  const unique = [...new Set(sizes)];
  return [...known.filter((s) => unique.includes(s)), ...unique.filter((s) => !known.includes(s))];
}

const cm = z.coerce.number().positive().max(300);

/** A stored size chart, dropping anything malformed. */
export function readChart(json: unknown): SizeChart {
  const out: SizeChart = {};
  if (!json || typeof json !== "object") return out;
  for (const [size, row] of Object.entries(json as Record<string, unknown>)) {
    if (!row || typeof row !== "object") continue;
    const clean: Partial<Record<Region, number>> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      const n = cm.safeParse(v);
      if (isRegion(k) && n.success) clean[k] = n.data;
    }
    if (Object.keys(clean).length) out[size] = clean;
  }
  return out;
}

export type StoredMeasure = Measure & { source: "photo" | "typed" };

/** A stored body profile's measurements. */
export function readBody(json: unknown): Body {
  const out: Body = {};
  if (!json || typeof json !== "object") return out;
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (!isRegion(k) || !v || typeof v !== "object") continue;
    const { value, low, high } = v as Record<string, unknown>;
    const val = cm.safeParse(value);
    if (!val.success) continue;
    const lo = cm.safeParse(low);
    const hi = cm.safeParse(high);
    out[k] = {
      value: val.data,
      low: lo.success ? Math.min(lo.data, val.data) : val.data,
      high: hi.success ? Math.max(hi.data, val.data) : val.data,
    };
  }
  return out;
}

export class FitDataError extends Error {}

const optInt = (min: number, max: number, msg: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), msg);

/** The factory's fit data form: `chart.<size>.<region>` cells plus fabric fields. */
export function parseFitForm(entries: Record<string, string>, sizes: string[]) {
  const fabric = z
    .object({
      fabricStretchPct: optInt(0, 100, "Stretch is a whole percent from 0 to 100"),
      gsm: optInt(20, 1000, "GSM is a whole number from 20 to 1000"),
      weave: z.string().trim().max(60),
      thermalMinC: optInt(-10, 50, "Comfort temperatures are whole °C from −10 to 50"),
      thermalMaxC: optInt(-10, 50, "Comfort temperatures are whole °C from −10 to 50"),
      breathability: optInt(1, 5, "Breathability is 1 to 5"),
      careNotes: z.string().trim().max(500),
    })
    .refine(
      (v) => v.thermalMinC === null || v.thermalMaxC === null || v.thermalMinC <= v.thermalMaxC,
      { message: "The lowest comfort temperature is above the highest" },
    )
    .parse({
      fabricStretchPct: entries.fabricStretchPct ?? "",
      gsm: entries.gsm ?? "",
      weave: entries.weave ?? "",
      thermalMinC: entries.thermalMinC ?? "",
      thermalMaxC: entries.thermalMaxC ?? "",
      breathability: entries.breathability ?? "",
      careNotes: entries.careNotes ?? "",
    });
  const chart: SizeChart = {};
  for (const size of sizes)
    for (const region of REGIONS) {
      const raw = entries[`chart.${size}.${region}`]?.trim();
      if (!raw) continue;
      const n = cm.safeParse(raw);
      if (!n.success)
        throw new FitDataError(`Enter the ${size} ${REGION_LABEL[region].toLowerCase()} in cm`);
      (chart[size] ??= {})[region] = Math.round(n.data * 10) / 10;
    }
  return { ...fabric, weave: fabric.weave || null, careNotes: fabric.careNotes || null, chart };
}
