// Runs in the vision worker, or on the main thread when workers are unavailable.
// Uses only OffscreenCanvas and ImageBitmap, no DOM.
import { CAL } from "../calibration";
import { turnAngle } from "../measure/pose";
import { outlineSpread } from "../measure/silhouette";
import { poseIssues } from "../measure/quality";
import { LM, type Issue, type Landmark, type Mask, type View } from "../types";
import { loadPose, type PoseModel, type PoseMode } from "./mediapipe";
import { cleanMask, imageQuality, loadCv } from "./opencv";

/** Live frame result; landmarks normalized 0..1. */
export interface LiveResult {
  people: number;
  landmarks: Landmark[];
  /** Shoulder turn from the camera plane, degrees; null without world landmarks. */
  turn: number | null;
  /** Pose inference time. */
  ms: number;
}

/** Still photo result; landmarks in pixels. */
export interface StillResult {
  model: PoseModel;
  width: number;
  height: number;
  landmarks: Landmark[];
  turn: number | null;
  mask: Mask;
  /** Torso outline change between a low and a high threshold, share of width. */
  outlineSpread: number | null;
  /** Masks at extra thresholds, for testing thresholds against tape measurements. */
  alt: { threshold: number; mask: Mask }[];
  issues: Issue[];
  sharpness: number;
  brightness: number;
  /** Pose inference and the whole still pipeline, ms. */
  ms: { pose: number; total: number };
}

const MIN_SHARPNESS = 40;
const BRIGHTNESS: [number, number] = [50, 215];

export async function warmUp(model: PoseModel, mode: PoseMode): Promise<void> {
  await (mode === "still" ? Promise.all([loadPose(model, mode), loadCv()]) : loadPose(model, mode));
}

function largest<T extends { y: number }>(people: T[][]): number {
  const span = (l: T[]) => Math.max(...l.map((p) => p.y)) - Math.min(...l.map((p) => p.y));
  let best = 0;
  people.forEach((l, i) => {
    if (span(l) > span(people[best])) best = i;
  });
  return best;
}

const lastTs = new Map<PoseModel, number>();

export async function detectLive(
  frame: ImageBitmap,
  timestamp: number,
  model: PoseModel,
): Promise<LiveResult> {
  const pose = await loadPose(model, "live");
  // Video mode needs strictly increasing timestamps per landmarker.
  const ts = Math.max(timestamp, (lastTs.get(model) ?? 0) + 1);
  lastTs.set(model, ts);
  try {
    const t0 = performance.now();
    const result = pose.detectForVideo(frame, ts);
    const ms = performance.now() - t0;
    const people = result.landmarks.length;
    if (!people) return { people, landmarks: [], turn: null, ms };
    const i = largest(result.landmarks);
    return {
      people,
      landmarks: result.landmarks[i].map((p) => ({
        x: p.x,
        y: p.y,
        visibility: p.visibility ?? 0,
      })),
      turn: turnAngle(result.worldLandmarks[i]),
      ms,
    };
  } finally {
    frame.close();
  }
}

export async function analyzeStill(
  frame: ImageBitmap,
  view: View,
  model: PoseModel,
  thresholds: number[] = [],
): Promise<StillResult> {
  const [pose, cv] = await Promise.all([loadPose(model, "still"), loadCv()]);
  const t0 = performance.now();
  const { width: w, height: h } = frame;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(frame, 0, 0);
  frame.close();

  const p0 = performance.now();
  const result = pose.detect(canvas);
  const poseMs = performance.now() - p0;
  const people = result.landmarks.length;
  // With two people, measure the larger one.
  const i = people ? largest(result.landmarks) : -1;

  const landmarks: Landmark[] =
    i >= 0
      ? result.landmarks[i].map((p) => ({ x: p.x * w, y: p.y * h, visibility: p.visibility ?? 0 }))
      : [];
  const turn = i >= 0 ? turnAngle(result.worldLandmarks[i]) : null;
  const probs = i >= 0 ? result.segmentationMasks?.[i]?.getAsFloat32Array() : undefined;
  result.segmentationMasks?.forEach((m) => m.close());

  // The torso: seed for choosing the person region, and rows for judging its outline.
  let seed: { x: number; y: number } | null = null;
  let rows: { x: number; y: number }[] = [];
  if (landmarks.length >= 33) {
    const sh = {
      x: (landmarks[LM.leftShoulder].x + landmarks[LM.rightShoulder].x) / 2,
      y: (landmarks[LM.leftShoulder].y + landmarks[LM.rightShoulder].y) / 2,
    };
    const hp = {
      x: (landmarks[LM.leftHip].x + landmarks[LM.rightHip].x) / 2,
      y: (landmarks[LM.leftHip].y + landmarks[LM.rightHip].y) / 2,
    };
    seed = { x: (sh.x + hp.x) / 2, y: (sh.y + hp.y) / 2 };
    rows = Array.from({ length: 9 }, (_, k) => {
      const t = 0.2 + (0.8 * k) / 8;
      return { x: sh.x + t * (hp.x - sh.x), y: sh.y + t * (hp.y - sh.y) };
    });
  }
  const toMask = (threshold: number): Mask => ({
    width: w,
    height: h,
    data: probs
      ? cleanMask(cv, probs, w, h, {
          threshold,
          kernel: CAL.mask.kernel,
          minGap: CAL.mask.minGap,
          seed,
        })
      : new Uint8Array(w * h),
  });
  const mask = toMask(CAL.mask.threshold);
  const [lo, hi] = CAL.mask.spreadThresholds;
  const spread = probs && rows.length ? outlineSpread(probs, w, rows, lo, hi) : null;
  const { sharpness, brightness } = imageQuality(cv, ctx.getImageData(0, 0, w, h));
  const issues = poseIssues(view, landmarks, mask, people, turn);
  if (spread !== null && spread > CAL.mask.spreadMax) issues.push("unclear_outline");
  if (sharpness < MIN_SHARPNESS) issues.push("blurry");
  if (brightness < BRIGHTNESS[0]) issues.push("too_dark");
  if (brightness > BRIGHTNESS[1]) issues.push("too_bright");
  const totalMs = performance.now() - t0;
  // Test masks are extra work, kept out of the timing.
  const alt = thresholds.map((threshold) => ({ threshold, mask: toMask(threshold) }));

  return {
    model,
    width: w,
    height: h,
    landmarks,
    turn,
    mask,
    outlineSpread: spread,
    alt,
    issues,
    sharpness,
    brightness,
    ms: { pose: poseMs, total: totalMs },
  };
}
