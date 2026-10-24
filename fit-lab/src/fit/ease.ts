import type { BodyKey } from "../types";
import type { Category, FitStyle, GarmentKey } from "../garments/database";

/**
 * Ease = garment - body, cm. Below `tight` is too tight (too short for lengths),
 * tight..snug is snug, snug..roomy is good, roomy..loose is roomy, above `loose`
 * is too loose. Lab starting values; tune them with real try-ons.
 */
export interface EaseBand {
  tight: number;
  snug: number;
  roomy: number;
  loose: number;
}

const band = (tight: number, snug: number, roomy: number, loose: number): EaseBand => ({
  tight,
  snug,
  roomy,
  loose,
});
const same = (b: EaseBand): Record<FitStyle, EaseBand> => ({
  slim: b,
  regular: b,
  relaxed: b,
  oversized: b,
});

export const EASE: Record<Category, Partial<Record<GarmentKey, Record<FitStyle, EaseBand>>>> = {
  top: {
    chest: {
      slim: band(2, 5, 10, 16),
      regular: band(4, 8, 18, 26),
      relaxed: band(8, 12, 24, 34),
      oversized: band(14, 20, 40, 54),
    },
    waist: {
      slim: band(0, 4, 12, 20),
      regular: band(2, 6, 24, 34),
      relaxed: band(6, 10, 30, 42),
      oversized: band(12, 18, 46, 60),
    },
    hip: {
      slim: band(0, 3, 10, 18),
      regular: band(2, 6, 20, 30),
      relaxed: band(6, 10, 26, 36),
      oversized: band(10, 16, 40, 54),
    },
    shoulder: {
      slim: band(-3, -1.5, 1.5, 3.5),
      regular: band(-2.5, -1, 3, 5),
      relaxed: band(-2, -0.5, 5, 8),
      oversized: band(0, 3, 14, 20),
    },
    sleeve: same(band(-4, -1.5, 2.5, 5)),
    length: {
      slim: band(8, 12, 22, 28),
      regular: band(9, 13, 25, 31),
      relaxed: band(9, 13, 27, 33),
      oversized: band(10, 14, 30, 36),
    },
  },
  bottom: {
    waist: {
      slim: band(-2, 0, 4, 7),
      regular: band(-1, 1, 5, 8),
      relaxed: band(0, 2, 7, 11),
      oversized: band(0, 2, 7, 11),
    },
    hip: {
      slim: band(0, 2, 8, 13),
      regular: band(2, 5, 12, 18),
      relaxed: band(4, 8, 18, 26),
      oversized: band(4, 8, 18, 26),
    },
    inseam: same(band(-6, -3, 2, 5)),
  },
};

/** Which body measurement each garment measurement is compared with. */
export const BODY_FOR: Record<GarmentKey, BodyKey> = {
  chest: "chest",
  waist: "waist",
  hip: "hip",
  shoulder: "shoulder",
  sleeve: "sleeve",
  length: "torso",
  inseam: "inseam",
};

/** Circumferences gain ease from fabric stretch; lengths and shoulders don't. */
export const STRETCHES: GarmentKey[] = ["chest", "waist", "hip"];
export const LENGTHS: GarmentKey[] = ["sleeve", "length", "inseam"];

/** How much each measurement counts when choosing a size. */
export const WEIGHT: Record<Category, Partial<Record<GarmentKey, number>>> = {
  top: { chest: 3, shoulder: 2, waist: 1, hip: 1, length: 1, sleeve: 1 },
  bottom: { waist: 3, hip: 3, inseam: 1 },
};
