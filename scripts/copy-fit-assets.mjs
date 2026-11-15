// Copies the fit feature's browser runtimes (DEC-020) into public/ so nothing is fetched from
// another site at run time: three.js's DRACO glTF decoder (fit viewer) and MediaPipe's WASM
// (on-phone body measuring). Runs on install. Pose models: `npm run fit:models`.
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const copies = [
  ["node_modules/three/examples/jsm/libs/draco/gltf", "public/draco"],
  ["node_modules/@mediapipe/tasks-vision/wasm", "public/fit-vision/mediapipe"],
];
for (const [from, to] of copies)
  if (existsSync(join(root, from))) cpSync(join(root, from), join(root, to), { recursive: true });
