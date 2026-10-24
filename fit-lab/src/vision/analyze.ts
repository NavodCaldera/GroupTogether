import type { View } from "../types";
import { vision } from "./client";
import type { StillResult } from "./engine";
import type { PoseModel } from "./mediapipe";

export interface PhotoAnalysis extends StillResult {
  view: View;
  /** The analysed image, kept on the main thread for overlays. */
  image: HTMLCanvasElement;
}

const MAX_SIDE = 1280;

export function toCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Capture mode: the careful pipeline on one still frame. */
export async function analyzePhoto(
  source: CanvasImageSource,
  width: number,
  height: number,
  view: View,
  model: PoseModel,
): Promise<PhotoAnalysis> {
  const image = toCanvas(source, width, height);
  const result = await vision.still(await createImageBitmap(image), view, model);
  return { ...result, view, image };
}
