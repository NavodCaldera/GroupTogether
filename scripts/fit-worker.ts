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
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  claimBodyFit,
  runBodyFitJob,
  upgradeBodies,
  type BodyWriter,
  type FitResult,
  type FitRunner,
} from "../src/server/body-fit-jobs";
import { FitServer } from "../src/server/fit-server";
import { LocalDiskStorage, storageDir } from "../src/server/storage/local";

const PYTHON = process.env.BODY_FIT_PYTHON || "python";
const FIT = join(process.cwd(), "tools", "body-fitting", "fit.py");
const TIMEOUT_MS = 5 * 60 * 1000;

/** One loaded fitter per job slot: the model's start-up is paid once, not on every job. */
function fitter() {
  const server = new FitServer(PYTHON, [FIT, "--serve"], TIMEOUT_MS);
  const withFile = async <T>(
    body: object,
    read: (result: FitResult, glbPath: string) => Promise<T>,
  ) => {
    const dir = await mkdtemp(join(tmpdir(), "body-fit-"));
    const glbPath = join(dir, "body.glb");
    try {
      return await read((await server.request({ ...body, glb: glbPath })) as FitResult, glbPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  const runFit: FitRunner = (input) =>
    withFile({ job: input }, async (result, glbPath) => ({
      result,
      glb: result.status === "ok" ? new Uint8Array(await readFile(glbPath)) : null,
    }));
  /** The body file again from stored parameters (older files gain the skeleton). */
  const writeBody: BodyWriter = (params) =>
    withFile({ params }, async (_, glbPath) => new Uint8Array(await readFile(glbPath)));
  return { runFit, writeBody, stop: () => server.stop() };
}

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
    const { runFit, writeBody, stop } = fitter();
    try {
      await work(runFit, writeBody);
    } finally {
      stop();
    }
  };
  const work = async (runFit: FitRunner, writeBody: BodyWriter) => {
    while (!stopping) {
      const job = await claimBodyFit(db);
      if (!job) {
        // Idle: bring a few older body files up to date.
        const upgraded = await upgradeBodies(db, storage, writeBody, 5).catch((error) => {
          console.error("body upgrade failed:", error);
          return 0;
        });
        if (upgraded) {
          console.log(`upgraded ${upgraded} body file(s)`);
          continue;
        }
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
