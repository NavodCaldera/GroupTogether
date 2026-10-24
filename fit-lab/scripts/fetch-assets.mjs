// Copies the MediaPipe WASM runtime and downloads the pose model into public/,
// so the app never sends photos or fetches code from elsewhere at run time.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";

cpSync(join(root, "node_modules/@mediapipe/tasks-vision/wasm"), join(root, "public/mediapipe"), {
  recursive: true,
});

const model = join(root, "public/models/pose_landmarker_heavy.task");
if (!existsSync(model)) {
  mkdirSync(dirname(model), { recursive: true });
  console.log("Downloading pose model…");
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model download failed: ${res.status} ${res.statusText}`);
  writeFileSync(model, Buffer.from(await res.arrayBuffer()));
}
console.log("Assets ready.");
