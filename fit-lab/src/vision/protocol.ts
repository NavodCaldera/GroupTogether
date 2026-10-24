import type { View } from "../types";
import type { LiveResult, StillResult } from "./engine";
import type { PoseMode, PoseModel } from "./mediapipe";

export type VisionRequest =
  | { id: number; type: "warm"; model: PoseModel; mode: PoseMode }
  | { id: number; type: "live"; frame: ImageBitmap; timestamp: number; model: PoseModel }
  | { id: number; type: "still"; frame: ImageBitmap; view: View; model: PoseModel };

export type VisionResponse =
  | { id: number; ok: true; result: LiveResult | StillResult | null }
  | { id: number; ok: false; error: string };
