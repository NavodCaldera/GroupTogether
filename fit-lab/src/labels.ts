import type { GarmentKey } from "./garments/database";
import type { Verdict } from "./fit/predict";
import type { BodyKey } from "./types";
import { LENGTHS } from "./fit/ease";

export const BODY_LABEL: Record<BodyKey, string> = {
  height: "Height",
  shoulder: "Shoulder",
  chest: "Chest",
  waist: "Waist",
  hip: "Hip",
  sleeve: "Arm",
  torso: "Torso",
  inseam: "Inseam",
};

export const GARMENT_LABEL: Record<GarmentKey, string> = {
  chest: "Chest",
  waist: "Waist",
  hip: "Hip",
  shoulder: "Shoulder",
  sleeve: "Sleeve",
  length: "Length",
  inseam: "Inseam",
};

const WIDTH_VERDICT: Record<Verdict, string> = {
  too_tight: "Too tight",
  snug: "Snug",
  good: "Good",
  roomy: "Roomy",
  too_loose: "Too loose",
};

const LENGTH_VERDICT: Record<Verdict, string> = {
  too_tight: "Too short",
  snug: "Short",
  good: "Good",
  roomy: "Long",
  too_loose: "Too long",
};

export function verdictLabel(key: GarmentKey, v: Verdict): string {
  return (LENGTHS.includes(key) ? LENGTH_VERDICT : WIDTH_VERDICT)[v];
}
