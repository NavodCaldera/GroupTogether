import type { View } from "../types";
import type { LiveResult, StillResult } from "./engine";
import type { PoseKind } from "./mediapipe";

export type VisionRequest =
  | { id: number; type: "warm"; kind: PoseKind }
  | { id: number; type: "live"; frame: ImageBitmap; timestamp: number }
  | { id: number; type: "still"; frame: ImageBitmap; view: View };

export type VisionResponse =
  | { id: number; ok: true; result: LiveResult | StillResult | null }
  | { id: number; ok: false; error: string };
