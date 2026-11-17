/**
 * Starting and stopping a process with everything it starts (the sim worker's run.py and the
 * Blender processes run.py starts). `child.kill()` stops only the first process.
 */
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

/** Elsewhere than Windows the child leads its own process group, so the group can be stopped. */
export function spawnTree(cmd: string, args: string[], options: SpawnOptions): ChildProcess {
  return spawn(cmd, args, { ...options, detached: process.platform !== "win32" });
}

/** Stops the child and every process under it; resolves once that has been asked for. */
export function killTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined || child.exitCode !== null) return Promise.resolve();
  if (process.platform === "win32")
    return new Promise((done) => {
      const k = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
      k.on("error", () => (child.kill(), done()));
      k.on("close", () => done());
    });
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
  return Promise.resolve();
}
