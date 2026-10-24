import { poseIssues } from "../measure/quality";
import type { Issue, Landmark, Mask, View } from "../types";
import { loadPose } from "./mediapipe";
import { cleanMask, imageQuality, loadCv } from "./opencv";

export interface PhotoAnalysis {
  view: View;
  image: HTMLCanvasElement;
  landmarks: Landmark[];
  mask: Mask;
  issues: Issue[];
  sharpness: number;
  brightness: number;
}

const MAX_SIDE = 1280;
const MIN_SHARPNESS = 40;
const BRIGHTNESS: [number, number] = [50, 215];

function toCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function analyzePhoto(
  source: CanvasImageSource,
  width: number,
  height: number,
  view: View,
): Promise<PhotoAnalysis> {
  const [pose, cv] = await Promise.all([loadPose(), loadCv()]);
  const image = toCanvas(source, width, height);
  const { width: w, height: h } = image;

  const result = pose.detect(image);
  const people = result.landmarks.length;
  // With two people, measure the larger one.
  const sizes = result.landmarks.map(
    (l) => Math.max(...l.map((p) => p.y)) - Math.min(...l.map((p) => p.y)),
  );
  const i = sizes.length ? sizes.indexOf(Math.max(...sizes)) : -1;

  const landmarks: Landmark[] =
    i >= 0
      ? result.landmarks[i].map((p) => ({ x: p.x * w, y: p.y * h, visibility: p.visibility ?? 0 }))
      : [];
  const raw = new Uint8Array(w * h);
  const probs = i >= 0 ? result.segmentationMasks?.[i]?.getAsFloat32Array() : undefined;
  if (probs) for (let j = 0; j < raw.length; j++) raw[j] = probs[j] > 0.5 ? 1 : 0;
  result.segmentationMasks?.forEach((m) => m.close());

  const mask: Mask = { width: w, height: h, data: probs ? cleanMask(cv, raw, w, h) : raw };
  const { sharpness, brightness } = imageQuality(cv, image);
  const issues = poseIssues(view, landmarks, mask, people);
  if (sharpness < MIN_SHARPNESS) issues.push("blurry");
  if (brightness < BRIGHTNESS[0]) issues.push("too_dark");
  if (brightness > BRIGHTNESS[1]) issues.push("too_bright");

  return { view, image, landmarks, mask, issues, sharpness, brightness };
}
