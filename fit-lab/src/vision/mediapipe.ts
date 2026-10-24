import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Copied or downloaded into public/ by scripts/fetch-assets.mjs, so photos are
// processed without calling any outside service.
const BASE = import.meta.env.BASE_URL;
const WASM = `${BASE}mediapipe`;

export type PoseModel = "lite" | "full" | "heavy";
/** Live: video mode, landmarks only. Still: image mode with the body mask. */
export type PoseMode = "live" | "still";

export interface Models {
  live: PoseModel;
  still: PoseModel;
}

export const DEFAULT_MODELS: Models = { live: "lite", still: "heavy" };

const modelPath = (m: PoseModel) => `${BASE}models/pose_landmarker_${m}.task`;

// A module worker can't importScripts, so it needs MediaPipe's ES module loader.
const WGS = (globalThis as { WorkerGlobalScope?: new () => unknown }).WorkerGlobalScope;
const inWorker = !!WGS && globalThis instanceof WGS;

let files: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
const loading = new Map<string, Promise<PoseLandmarker>>();
let created = 0;
let queue: Promise<unknown> = Promise.resolve();

async function create(model: PoseModel, mode: PoseMode): Promise<PoseLandmarker> {
  files ??= FilesetResolver.forVisionTasks(WASM, inWorker);
  const base = await files;
  // The loader sets a global factory that each new task consumes; an ES module
  // import is cached and won't set it again, so give every task its own copy.
  const fileset = { ...base, wasmLoaderPath: `${base.wasmLoaderPath}?task=${++created}` };
  const make = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath(model), delegate },
      // GPU work needs its own canvas; an OffscreenCanvas works in a worker too.
      ...(delegate === "GPU" && typeof OffscreenCanvas !== "undefined"
        ? { canvas: new OffscreenCanvas(1, 1) }
        : {}),
      runningMode: mode === "live" ? "VIDEO" : "IMAGE",
      numPoses: 2,
      outputSegmentationMasks: mode === "still",
    });
  try {
    return await make("GPU");
  } catch {
    return await make("CPU");
  }
}

export function loadPose(model: PoseModel, mode: PoseMode): Promise<PoseLandmarker> {
  const key = `${model}:${mode}`;
  let p = loading.get(key);
  if (!p) {
    // One at a time: concurrent creation races on the same global factory.
    p = queue.then(() => create(model, mode));
    queue = p.catch(() => undefined);
    loading.set(key, p);
    p.catch(() => loading.delete(key));
  }
  return p;
}
