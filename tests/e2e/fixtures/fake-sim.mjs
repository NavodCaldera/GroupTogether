/**
 * Stands in for tools/cloth-sim/run.py in browser tests (`SIM_PYTHON=node SIM_SCRIPT=<this>`):
 * reads the job from stdin, writes a small skinned garment per size into out_dir and prints the
 * result JSON as the last stdout line (the contract in scripts/sim-worker.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { skinnedGlb } from "./glb.mjs";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const job = JSON.parse(input);
mkdirSync(job.out_dir, { recursive: true });

const sizes = {};
Object.entries(job.sizes).forEach(([size, areas], i) => {
  const garment = `${i}.glb`;
  writeFileSync(
    join(job.out_dir, garment),
    skinnedGlb({
      attribute: "_REGION_ID",
      bottom: 0.85,
      top: 1.45,
      radius: 0.16 + 0.01 * i,
      value: (y) => (y > 1.25 ? 0 : y > 1.05 ? 1 : 2), // chest, waist, hip
    }),
  );
  const tension = Object.fromEntries(
    Object.keys(areas).map((area) => [area, Math.max(0.05, 0.95 - 0.2 * i)]),
  );
  sizes[size] = { tension, garment };
});
console.log("fake simulation done");
console.log(JSON.stringify({ status: "ok", seconds: 1, sizes }));
