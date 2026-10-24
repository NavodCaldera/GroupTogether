// Copies the MediaPipe WASM runtime and downloads the pose models into public/,
// so the app never sends photos or fetches code from elsewhere at run time.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODELS = {
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  "pose_landmarker_full.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  "pose_landmarker_heavy.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
};

cpSync(join(root, "node_modules/@mediapipe/tasks-vision/wasm"), join(root, "public/mediapipe"), {
  recursive: true,
});

for (const [name, url] of Object.entries(MODELS)) {
  const file = join(root, "public/models", name);
  if (existsSync(file)) continue;
  mkdirSync(dirname(file), { recursive: true });
  console.log(`Downloading ${name}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model download failed: ${res.status} ${res.statusText}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
console.log("Assets ready.");
