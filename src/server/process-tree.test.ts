import { expect, it } from "vitest";
import { killTree, spawnTree } from "./process-tree";

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const until = async (ok: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
  return ok();
};

it("killing the simulator also stops the process it started (Blender)", async () => {
  // A parent that starts a long-running child and prints the child's pid, like run.py and Blender.
  // On Windows the child breaks away from Node's job object, as Python's subprocess does.
  const parent = spawnTree(
    process.execPath,
    [
      "-e",
      `const c = require("node:child_process").spawn(process.execPath,
        ["-e", "setInterval(() => {}, 1000)"],
        { stdio: "ignore", detached: ${process.platform === "win32"} });
       console.log(c.pid); setInterval(() => {}, 1000);`,
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  const pid = await new Promise<number>((done) =>
    parent.stdout!.once("data", (d: Buffer) => done(Number(String(d).trim()))),
  );
  try {
    expect(alive(pid)).toBe(true);
    await killTree(parent);
    expect(await until(() => !alive(pid), 10_000)).toBe(true);
  } finally {
    if (alive(pid)) process.kill(pid);
    if (parent.exitCode === null) parent.kill();
  }
}, 30_000);
