/** Body areas the fit heatmap colours (DEC-020). No database. */

export const REGIONS = ["chest", "waist", "hip", "upperArm", "thigh", "shoulder", "torso"] as const;

export type Region = (typeof REGIONS)[number];

/** Prisma `FitRegion` value for each area. */
export const REGION_ENUM = {
  chest: "CHEST",
  waist: "WAIST",
  hip: "HIP",
  upperArm: "UPPER_ARM",
  thigh: "THIGH",
  shoulder: "SHOULDER",
  torso: "TORSO",
} as const satisfies Record<Region, string>;

export type RegionEnum = (typeof REGION_ENUM)[Region];

export const regionFromEnum = (e: RegionEnum): Region => REGIONS.find((r) => REGION_ENUM[r] === e)!;

/**
 * `region_id` vertex attribute baked into the glTF by tools/fit-simulation; 255 is neutral
 * (normal garment material). The shader's uniform array follows this order.
 */
export const REGION_ID: Record<Region, number> = {
  chest: 0,
  waist: 1,
  hip: 2,
  upperArm: 3,
  thigh: 4,
  shoulder: 5,
  torso: 6,
};

export const REGION_LABEL: Record<Region, string> = {
  chest: "Chest",
  waist: "Waist",
  hip: "Hip",
  upperArm: "Upper arm",
  thigh: "Thigh",
  shoulder: "Shoulders",
  torso: "Length",
};

/** Lengths gain nothing from fabric stretch; circumferences do. */
export const IS_LENGTH: Record<Region, boolean> = {
  chest: false,
  waist: false,
  hip: false,
  upperArm: false,
  thigh: false,
  shoulder: true,
  torso: true,
};

export const isRegion = (k: string): k is Region => (REGIONS as readonly string[]).includes(k);
