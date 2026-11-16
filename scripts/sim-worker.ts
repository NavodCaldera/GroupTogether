/**
 * Runs Deep Fit Tests (DEC-021): takes queued jobs and cloth-simulates the garment on the buyer's
 * own body with Blender (tools/cloth-sim). CPU only. Run one per worker machine:
 *
 *   npm run sim:worker                  # keeps running, polls every 5 s when idle
 *   npm run sim:worker -- --once        # one job, then exit (for tests and cron)
 *
 * BLENDER_BIN (required): the Blender 4.5 executable; tools/cloth-sim/run.py starts it.
 * SIM_PYTHON: the plain Python that runs run.py (default `python`).
 * SIM_SCRIPT: the simulator script (default tools/cloth-sim/run.py); tests point it at a fake.
 * SIM_CONCURRENCY: jobs at a time (default 1; one simulation uses several cores).
 *
 * The contract with the simulator (tools/cloth-sim/run.py, `run.simulate`):
 *   - The worker runs `<SIM_PYTHON> <SIM_SCRIPT>` (BLENDER_BIN passed through in the environment),
 *     writes one job as JSON to its stdin and closes stdin. Paths are in a fresh temporary folder:
 *       { "body": "<abs path to the buyer's body.glb>", "cls": "top"|"bottom"|"dress"|"outer",
 *         "short": bool, "sizes": { "M": { "chest": 102, ... }, ... },
 *         "fabric": { "gsm": n|null, "stretch_pct": n|null, "weave": s|null },
 *         "motions": ["WALK","RUN","REACH","SIT"], "out_dir": "<abs path>" }
 *   - The LAST line of stdout is the result JSON (earlier lines are logs):
 *       { "status": "ok"|"failed", "seconds": n,
 *         "sizes": { "M": { "tension": { "chest": 0.31, ... }, "garment": "M.glb",
 *                           "note"?: "unstable" } } }
 *     Garment paths are relative to out_dir. A size that explodes or times out has every tension
 *     1.0 and "note": "unstable"; other sizes still return.
 *   - A non-zero exit, no parsable last line, or no result in TIMEOUT_MS is a crash: the job is
 *     retried (3 attempts in all). "status": "failed" fails the job at once.
 * Blender (GPL) runs only as that separate process; nothing from it is imported here.
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  claimDeepFit,
  runDeepFitJob,
  type SimResult,
  type SimRunner,
} from "../src/server/deep-fit-jobs";
import { LocalDiskStorage, storageDir } from "../src/server/storage/local";

const PYTHON = process.env.SIM_PYTHON || "python";
const SCRIPT = resolve(process.env.SIM_SCRIPT || join("tools", "cloth-sim", "run.py"));
/** run.py gives each size 600 s; four sizes plus Blender start-up fit well inside this. */
const TIMEOUT_MS = 60 * 60 * 1000;

/** Runs the simulator once and returns its last stdout line. */
function runSimulator(job: object): Promise<string> {
  return new Promise((done, fail) => {
    const child = spawn(PYTHON, [SCRIPT], { stdio: ["pipe", "pipe", "inherit"], env: process.env });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error("simulation timed out"));
    }, TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
      if (out.length > 1_000_000) out = out.slice(-500_000); // keep the tail; logs can be long
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return fail(new Error(`simulator exited with ${code}`));
      done(out.trim().split(/\r?\n/).at(-1) ?? "");
    });
    child.stdin.end(JSON.stringify(job));
  });
}

const simulate: SimRunner = async (input) => {
  const dir = await mkdtemp(join(tmpdir(), "deep-fit-"));
  try {
    const body = join(dir, "body.glb");
    const outDir = join(dir, "out");
    await writeFile(body, input.body);
    const { body: _bytes, ...rest } = input;
    const result = JSON.parse(await runSimulator({ ...rest, body, out_dir: outDir })) as SimResult;
    const garments: Record<string, Uint8Array> = {};
    for (const [size, s] of Object.entries(result.sizes ?? {})) {
      if (!s.garment) continue;
      const path = resolve(outDir, s.garment);
      if (!path.startsWith(resolve(outDir) + sep)) continue; // never outside out_dir
      garments[size] = new Uint8Array(await readFile(path).catch(() => Buffer.alloc(0)));
      if (!garments[size].length) delete garments[size];
    }
    return { result, garments };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

async function main() {
  if (!process.env.BLENDER_BIN) throw new Error("BLENDER_BIN is not set");
  const once = process.argv.includes("--once");
  const concurrency = Math.max(1, Number(process.env.SIM_CONCURRENCY ?? 1));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: concurrency + 1 }),
  });
  const storage = new LocalDiskStorage(storageDir());
  let stopping = false;
  process.on("SIGINT", () => (stopping = true));
  process.on("SIGTERM", () => (stopping = true));

  const loop = async () => {
    while (!stopping) {
      const job = await claimDeepFit(db);
      if (!job) {
        if (once) return;
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      const t = Date.now();
      const outcome = await runDeepFitJob(db, storage, simulate, job);
      console.log(`deep fit ${job.id}: ${outcome} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
      if (once) return;
    }
  };
  await Promise.all(Array.from({ length: once ? 1 : concurrency }, loop));
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
