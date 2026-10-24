// Runs in the vision worker, or on the main thread when workers are unavailable.
// Uses only OffscreenCanvas and ImageBitmap, no DOM.
import { turnAngle } from "../measure/pose";
import { poseIssues } from "../measure/quality";
import type { Issue, Landmark, Mask, View } from "../types";
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
  const raw = new Uint8Array(w * h);
  const probs = i >= 0 ? result.segmentationMasks?.[i]?.getAsFloat32Array() : undefined;
  if (probs) for (let j = 0; j < raw.length; j++) raw[j] = probs[j] > 0.5 ? 1 : 0;
  result.segmentationMasks?.forEach((m) => m.close());

  const mask: Mask = { width: w, height: h, data: probs ? cleanMask(cv, raw, w, h) : raw };
  const { sharpness, brightness } = imageQuality(cv, ctx.getImageData(0, 0, w, h));
  const issues = poseIssues(view, landmarks, mask, people, turn);
  if (sharpness < MIN_SHARPNESS) issues.push("blurry");
  if (brightness < BRIGHTNESS[0]) issues.push("too_dark");
  if (brightness > BRIGHTNESS[1]) issues.push("too_bright");

  return {
    model,
    width: w,
    height: h,
    landmarks,
    turn,
    mask,
    issues,
    sharpness,
    brightness,
    ms: { pose: poseMs, total: performance.now() - t0 },
  };
}
