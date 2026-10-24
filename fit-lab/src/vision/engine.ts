// Runs in the vision worker, or on the main thread when workers are unavailable.
// Uses only OffscreenCanvas and ImageBitmap, no DOM.
import { poseIssues } from "../measure/quality";
import type { Issue, Landmark, Mask, View } from "../types";
import { loadPose, type PoseKind } from "./mediapipe";
import { cleanMask, imageQuality, loadCv } from "./opencv";

/** Live frame result; landmarks normalized 0..1. */
export interface LiveResult {
  people: number;
  landmarks: Landmark[];
}

/** Still photo result; landmarks in pixels. */
export interface StillResult {
  width: number;
  height: number;
  landmarks: Landmark[];
  mask: Mask;
  issues: Issue[];
  sharpness: number;
  brightness: number;
}

const MIN_SHARPNESS = 40;
const BRIGHTNESS: [number, number] = [50, 215];

export async function warmUp(kind: PoseKind): Promise<void> {
  await (kind === "still" ? Promise.all([loadPose("still"), loadCv()]) : loadPose("live"));
}

let lastTs = 0;

export async function detectLive(frame: ImageBitmap, timestamp: number): Promise<LiveResult> {
  const pose = await loadPose("live");
  // Video mode needs strictly increasing timestamps.
  lastTs = Math.max(timestamp, lastTs + 1);
  try {
    const result = pose.detectForVideo(frame, lastTs);
    const people = result.landmarks.length;
    const landmarks = people
      ? largest(result.landmarks).map((p) => ({ x: p.x, y: p.y, visibility: p.visibility ?? 0 }))
      : [];
    return { people, landmarks };
  } finally {
    frame.close();
  }
}

function largest<T extends { y: number }>(people: T[][]): T[] {
  const span = (l: T[]) => Math.max(...l.map((p) => p.y)) - Math.min(...l.map((p) => p.y));
  return people.reduce((a, b) => (span(b) > span(a) ? b : a));
}

export async function analyzeStill(frame: ImageBitmap, view: View): Promise<StillResult> {
  const [pose, cv] = await Promise.all([loadPose("still"), loadCv()]);
  const { width: w, height: h } = frame;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(frame, 0, 0);
  frame.close();

  const result = pose.detect(canvas);
  const people = result.landmarks.length;
  // With two people, measure the larger one.
  let i = -1;
  if (people) i = result.landmarks.indexOf(largest(result.landmarks));

  const landmarks: Landmark[] =
    i >= 0
      ? result.landmarks[i].map((p) => ({ x: p.x * w, y: p.y * h, visibility: p.visibility ?? 0 }))
      : [];
  const raw = new Uint8Array(w * h);
  const probs = i >= 0 ? result.segmentationMasks?.[i]?.getAsFloat32Array() : undefined;
  if (probs) for (let j = 0; j < raw.length; j++) raw[j] = probs[j] > 0.5 ? 1 : 0;
  result.segmentationMasks?.forEach((m) => m.close());

  const mask: Mask = { width: w, height: h, data: probs ? cleanMask(cv, raw, w, h) : raw };
  const { sharpness, brightness } = imageQuality(cv, ctx.getImageData(0, 0, w, h));
  const issues = poseIssues(view, landmarks, mask, people);
  if (sharpness < MIN_SHARPNESS) issues.push("blurry");
  if (brightness < BRIGHTNESS[0]) issues.push("too_dark");
  if (brightness > BRIGHTNESS[1]) issues.push("too_bright");

  return { width: w, height: h, landmarks, mask, issues, sharpness, brightness };
}
