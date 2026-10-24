import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// Both are copied or downloaded into public/ by scripts/fetch-assets.mjs, so photos
// are processed without calling any outside service.
const WASM = `${import.meta.env.BASE_URL}mediapipe`;
const MODEL = `${import.meta.env.BASE_URL}models/pose_landmarker_heavy.task`;

let loading: Promise<PoseLandmarker> | null = null;

export function loadPose(): Promise<PoseLandmarker> {
  loading ??= (async () => {
    const files = await FilesetResolver.forVisionTasks(WASM);
    const create = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: "IMAGE",
        numPoses: 2,
        outputSegmentationMasks: true,
      });
    try {
      return await create("GPU");
    } catch {
      return await create("CPU");
    }
  })();
  loading.catch(() => (loading = null));
  return loading;
}
