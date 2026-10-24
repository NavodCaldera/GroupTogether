import { CAL } from "../calibration";
import {
  LM,
  type Body,
  type BodyKey,
  type Estimate,
  type Issue,
  type Landmark,
  type Mask,
  type Span,
} from "../types";
import { distance, ellipsePerimeter, midpoint } from "./geometry";
import { extremeSpan, smoothedSpan, spanAt, spanWidth, verticalExtent } from "./silhouette";

export interface PosePhoto {
  landmarks: Landmark[];
  mask: Mask;
}

interface Frame {
  cmPerPx: number;
  top: number;
  bottom: number;
  shoulderY: number;
  hipY: number;
  torsoPx: number;
  xAt: (y: number) => number;
}

export interface SideMeasure {
  cmPerPx: number;
  top: number;
  bottom: number;
  shoulderY: number;
  hipY: number;
  chest: Span;
  waist: Span;
  hip: Span;
}

export interface FrontMeasure extends SideMeasure {
  /** Waist row as a fraction of shoulder line to hip line. */
  waistAt: number;
  shoulderPx: number;
  armPx: number | null;
  torsoPx: number;
  legPx: number;
  armsTouching: boolean;
}

/** Scale from the known height, and the torso axis from the shoulder and hip landmarks. */
function frame(photo: PosePhoto, heightCm: number): Frame | null {
  const ext = verticalExtent(photo.mask);
  const lm = photo.landmarks;
  if (!ext || lm.length < 33 || heightCm <= 0) return null;
  const shoulder = midpoint(lm[LM.leftShoulder], lm[LM.rightShoulder]);
  const hip = midpoint(lm[LM.leftHip], lm[LM.rightHip]);
  const torsoPx = hip.y - shoulder.y;
  if (torsoPx <= 0) return null;
  const xAt = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - shoulder.y) / torsoPx));
    return shoulder.x + t * (hip.x - shoulder.x);
  };
  return {
    cmPerPx: heightCm / (ext.bottom - ext.top + 1),
    top: ext.top,
    bottom: ext.bottom,
    shoulderY: shoulder.y,
    hipY: hip.y,
    torsoPx,
    xAt,
  };
}

function torsoSpans(photo: PosePhoto, f: Frame, waistAt: number | null) {
  const { mask } = photo;
  const row = (t: number) => f.shoulderY + t * f.torsoPx;
  const chestY = row(CAL.chestAt);
  const chest = smoothedSpan(mask, chestY, f.xAt(chestY));
  const waist =
    waistAt === null
      ? extremeSpan(mask, row(CAL.waistBand[0]), row(CAL.waistBand[1]), f.xAt, "narrowest")
      : smoothedSpan(mask, row(waistAt), f.xAt(row(waistAt)));
  const hip = extremeSpan(
    mask,
    f.hipY + CAL.hipBand[0] * f.torsoPx,
    f.hipY + CAL.hipBand[1] * f.torsoPx,
    f.xAt,
    "widest",
  );
  return chest && waist && hip ? { chest, waist, hip } : null;
}

/** An elbow or wrist inside the torso run on its own row means the arm is merged into the silhouette. */
function armInside(photo: PosePhoto, f: Frame): boolean {
  const end = f.hipY + CAL.hipBand[1] * f.torsoPx;
  return [LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist]
    .map((i) => photo.landmarks[i])
    .filter((a) => a.visibility >= 0.5 && a.y > f.shoulderY && a.y < end)
    .some((a) => {
      const s = spanAt(photo.mask, a.y, f.xAt(a.y));
      return !!s && a.x >= s.left && a.x <= s.right;
    });
}

function armLength(lm: Landmark[]): number | null {
  const sides = [
    [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
    [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
  ]
    .map((ids) => ids.map((i) => lm[i]))
    .filter((pts) => pts.every((p) => p.visibility >= 0.5))
    .map(([s, e, w]) => distance(s, e) + distance(e, w));
  return sides.length ? sides.reduce((a, b) => a + b, 0) / sides.length : null;
}

export function measureFront(photo: PosePhoto, heightCm: number): FrontMeasure | null {
  const f = frame(photo, heightCm);
  if (!f) return null;
  const spans = torsoSpans(photo, f, null);
  if (!spans) return null;
  const lm = photo.landmarks;
  return {
    cmPerPx: f.cmPerPx,
    top: f.top,
    bottom: f.bottom,
    shoulderY: f.shoulderY,
    hipY: f.hipY,
    ...spans,
    waistAt: (spans.waist.y - f.shoulderY) / f.torsoPx,
    shoulderPx: distance(lm[LM.leftShoulder], lm[LM.rightShoulder]),
    armPx: armLength(lm),
    torsoPx: f.torsoPx,
    legPx: f.bottom - f.hipY,
    armsTouching: armInside(photo, f),
  };
}

/** Side photo depths; `waistAt` comes from the front photo so both use the same waist row. */
export function measureSide(
  photo: PosePhoto,
  heightCm: number,
  waistAt: number | null,
): SideMeasure | null {
  const f = frame(photo, heightCm);
  if (!f) return null;
  const spans = torsoSpans(photo, f, waistAt ?? CAL.waistAtDefault);
  if (!spans) return null;
  return {
    cmPerPx: f.cmPerPx,
    top: f.top,
    bottom: f.bottom,
    shoulderY: f.shoulderY,
    hipY: f.hipY,
    ...spans,
  };
}

export interface BodyInput {
  heightCm: number;
  typed: Partial<Record<BodyKey, number>>;
  front?: { measure: FrontMeasure; issues: Issue[] } | null;
  side?: { measure: SideMeasure; issues: Issue[] } | null;
}

const spread = (issues: Issue[]) => 1 + CAL.issuePenalty * issues.length;

/** Photo estimates where photos allow, typed values always win. */
export function estimateBody({ heightCm, typed, front, side }: BodyInput): Body {
  const photo: Partial<Record<BodyKey, { value: number; sd: number }>> = {};

  if (front) {
    const m = front.measure;
    const k = spread(front.issues);
    photo.shoulder = {
      value: m.shoulderPx * m.cmPerPx * CAL.shoulderFactor,
      sd: CAL.sd.shoulder * k,
    };
    if (m.armPx !== null)
      photo.sleeve = { value: m.armPx * m.cmPerPx * CAL.armFactor, sd: CAL.sd.sleeve * k };
    photo.torso = { value: m.torsoPx * m.cmPerPx, sd: CAL.sd.torso * k };
    photo.inseam = { value: m.legPx * m.cmPerPx - CAL.crotchDropCm, sd: CAL.sd.inseam * k };

    if (side) {
      const s = side.measure;
      const ks = spread([...front.issues, ...side.issues]);
      for (const key of ["chest", "waist", "hip"] as const) {
        const width = spanWidth(m[key]) * m.cmPerPx;
        const depth = spanWidth(s[key]) * s.cmPerPx;
        photo[key] = {
          value: ellipsePerimeter(width / 2, depth / 2) * CAL.circumference[key],
          sd: CAL.sd[key] * ks,
        };
      }
    }
  }

  const body: Body = { height: { value: heightCm, sd: CAL.typedSd, source: "typed" } };
  const keys: BodyKey[] = ["shoulder", "chest", "waist", "hip", "sleeve", "torso", "inseam"];
  for (const key of keys) {
    const t = typed[key];
    const p = photo[key];
    if (t !== undefined && t > 0) {
      const e: Estimate = { value: t, sd: CAL.typedSd, source: "typed" };
      if (p) {
        e.photo = p.value;
        e.mismatch = Math.abs(p.value - t) > 2 * p.sd;
      }
      body[key] = e;
    } else if (p) {
      body[key] = { value: p.value, sd: p.sd, source: "photo" };
    }
  }
  return body;
}
