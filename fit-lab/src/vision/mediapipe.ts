import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Copied or downloaded into public/ by scripts/fetch-assets.mjs, so photos are
// processed without calling any outside service.
const BASE = import.meta.env.BASE_URL;
const WASM = `${BASE}mediapipe`;
const MODEL = {
  live: `${BASE}models/pose_landmarker_lite.task`,
  still: `${BASE}models/pose_landmarker_heavy.task`,
};

export type PoseKind = keyof typeof MODEL;

// A module worker can't importScripts, so it needs MediaPipe's ES module loader.
const WGS = (globalThis as { WorkerGlobalScope?: new () => unknown }).WorkerGlobalScope;
const inWorker = !!WGS && globalThis instanceof WGS;

let files: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
const loading: Partial<Record<PoseKind, Promise<PoseLandmarker>>> = {};

async function create(kind: PoseKind): Promise<PoseLandmarker> {
  files ??= FilesetResolver.forVisionTasks(WASM, inWorker);
  const fileset = await files;
  const make = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL[kind], delegate },
      // GPU work needs its own canvas; an OffscreenCanvas works in a worker too.
      ...(delegate === "GPU" && typeof OffscreenCanvas !== "undefined"
        ? { canvas: new OffscreenCanvas(1, 1) }
        : {}),
      runningMode: kind === "live" ? "VIDEO" : "IMAGE",
      numPoses: 2,
      outputSegmentationMasks: kind === "still",
    });
  try {
    return await make("GPU");
  } catch {
    return await make("CPU");
  }
}

/** Live: the lite model on video frames. Still: the heavy model with a body mask. */
export function loadPose(kind: PoseKind): Promise<PoseLandmarker> {
  const p = (loading[kind] ??= create(kind));
  p.catch(() => delete loading[kind]);
  return p;
}
