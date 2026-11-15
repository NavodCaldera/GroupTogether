/**
 * Builds buyers' own 3D bodies (DEC-021): takes queued jobs and runs the Python fitter
 * (tools/body-fitting/fit.py) on each. CPU only. Run one per worker machine:
 *
 *   npm run fit:worker                  # keeps running, polls every 2 s when idle
 *   npm run fit:worker -- --once        # one job, then exit (for tests and cron)
 *
 * BODY_FIT_PYTHON: the Python with tools/body-fitting/requirements.txt (default `python`).
 * BODY_FIT_CONCURRENCY: jobs at a time (default 1; about one per 2 CPU cores).
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  claimBodyFit,
  runBodyFitJob,
  type FitResult,
  type FitRunner,
} from "../src/server/body-fit-jobs";
import { LocalDiskStorage, storageDir } from "../src/server/storage/local";

const PYTHON = process.env.BODY_FIT_PYTHON || "python";
const FIT = join(process.cwd(), "tools", "body-fitting", "fit.py");
const TIMEOUT_MS = 5 * 60 * 1000;

const runFit: FitRunner = async (input) => {
  const dir = await mkdtemp(join(tmpdir(), "body-fit-"));
  const glbPath = join(dir, "body.glb");
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(PYTHON, [FIT, "-", "--glb", glbPath], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(`fit.py exited ${code}: ${err.trim().split("\n").pop()}`));
      });
      child.stdin.end(JSON.stringify(input));
    });
    const result = JSON.parse(stdout.trim().split("\n").pop()!) as FitResult;
    const glb = result.status === "ok" ? new Uint8Array(await readFile(glbPath)) : null;
    return { result, glb };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

async function main() {
  const once = process.argv.includes("--once");
  const concurrency = Math.max(1, Number(process.env.BODY_FIT_CONCURRENCY ?? 1));
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
      const job = await claimBodyFit(db);
      if (!job) {
        if (once) return;
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      const t = Date.now();
      const outcome = await runBodyFitJob(db, storage, runFit, job);
      console.log(`body fit ${job.id}: ${outcome} in ${((Date.now() - t) / 1000).toFixed(1)} s`);
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
