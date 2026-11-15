// Downloads the MediaPipe pose models (Apache 2.0) used to measure buyers on their phone
// (DEC-020) into public/fit-vision/models. Photos never leave the phone; only these files are
// served to it. Lite ~6 MB (live guidance), Full ~9 MB (photo measuring).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://storage.googleapis.com/mediapipe-models/pose_landmarker";
const MODELS = {
  "pose_landmarker_lite.task": `${BASE}/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  "pose_landmarker_full.task": `${BASE}/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
};
for (const [name, url] of Object.entries(MODELS)) {
  const file = join(root, "public/fit-vision/models", name);
  if (existsSync(file)) continue;
  mkdirSync(dirname(file), { recursive: true });
  console.log(`Downloading ${name}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model download failed: ${res.status} ${res.statusText}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}
console.log("Fit models ready.");
