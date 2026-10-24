export type View = "front" | "side";

/** Body measurements in cm. `torso` is shoulder line to hip line, used for garment length. */
export type BodyKey =
  "height" | "shoulder" | "chest" | "waist" | "hip" | "sleeve" | "torso" | "inseam";

/** Pose landmark in image pixels. */
export interface Landmark {
  x: number;
  y: number;
  visibility: number;
}

/** Binary body mask, 1 = body, row-major. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Horizontal run of body pixels on one row, inclusive. */
export interface Span {
  y: number;
  left: number;
  right: number;
}

export type Issue =
  | "no_person"
  | "several_people"
  | "not_full_body"
  | "too_small"
  | "blurry"
  | "too_dark"
  | "too_bright"
  | "not_facing"
  | "not_sideways"
  | "arms_touching"
  | "leaning";

export interface Estimate {
  value: number;
  /** One standard deviation, cm. */
  sd: number;
  source: "typed" | "photo";
  /** Photo estimate when a typed value is used instead. */
  photo?: number;
  /** Typed and photo values disagree by more than two photo standard deviations. */
  mismatch?: boolean;
}

export type Body = Partial<Record<BodyKey, Estimate>>;

/** MediaPipe pose landmark indices. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;
