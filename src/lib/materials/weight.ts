/** WEIGHT_v1 (DEC-022): gsm on a line from 80 (0) to 400 (100). */
import { WEIGHT } from "./rules";

export const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));

/** Rounded to one decimal so stored and shown values agree */
export function weightPosition(gsm: number): number {
  if (!Number.isFinite(gsm) || gsm <= 0) throw new Error("gsm must be a positive number");
  const raw = ((gsm - WEIGHT.minGsm) / (WEIGHT.maxGsm - WEIGHT.minGsm)) * 100;
  return Math.round(clamp(raw) * 10) / 10;
}

export function weightBand(min: number, max: number): [number, number] {
  if (min > max) throw new Error("gsm range is reversed");
  return [weightPosition(min), weightPosition(max)];
}

/** Plain caption for the details grid, from the same rule */
export function weightWord(position: number): string {
  if (position < 20) return "Very light";
  if (position < 40) return "Light";
  if (position < 60) return "Mid-weight";
  if (position < 80) return "Heavy";
  return "Very heavy";
}
