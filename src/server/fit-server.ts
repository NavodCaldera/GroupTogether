/**
 * One long-running `fit.py --serve` process (DEC-021): the body model loads once, then each
 * request is a JSON line in and a JSON line out. Used by the worker (scripts/fit-worker.ts), never
 * by the web app. A crash or a request that takes too long ends the process; the next request
 * starts a fresh one.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

interface Waiting {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class FitServer {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private waiting = new Map<string, Waiting>();

  constructor(
    private command: string,
    private args: string[],
    private timeoutMs = 5 * 60 * 1000,
  ) {}

  private start(): Promise<void> {
    const child = spawn(this.command, this.args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    let stderr = "";
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-2000)));
    child.stdin.on("error", () => {}); // a dead process is reported by "close"
    let up: () => void;
    let failed: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      up = resolve;
      failed = reject;
    });
    ready.catch(() => {});
    createInterface({ input: child.stdout }).on("line", (line) => {
      let message: { ready?: boolean; id?: string | null; result?: unknown; error?: string };
      try {
        message = JSON.parse(line);
      } catch {
        return; // not ours (a library printing on stdout)
      }
      if (message.ready) return up();
      const waiting = message.id ? this.waiting.get(message.id) : undefined;
      if (!waiting) return;
      this.waiting.delete(message.id!);
      clearTimeout(waiting.timer);
      if (message.error) waiting.reject(new Error(message.error));
      else waiting.resolve(message.result);
    });
    const ended = (why: string) => {
      const error = new Error(`${why}: ${stderr.trim().split("\n").pop() ?? ""}`);
      failed(error);
      this.retire(child, error);
    };
    child.on("error", (error) => ended(`fitter did not start (${error.message})`));
    child.on("close", (code) => ended(`fitter exited ${code}`));
    return ready;
  }

  /** Forgets a finished or stuck process and fails everything it still owed. */
  private retire(child: ChildProcessWithoutNullStreams, error: Error) {
    if (this.child !== child) return;
    this.child = null;
    this.ready = null;
    for (const waiting of this.waiting.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.waiting.clear();
    child.kill();
  }

  /** Sends one request and resolves with its result; rejects on a refusal, crash or timeout. */
  async request(body: Record<string, unknown>): Promise<unknown> {
    if (!this.child) this.ready = this.start();
    await this.ready;
    const child = this.child;
    if (!child) throw new Error("fitter exited");
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      // A stuck process is in an unknown state: the next request starts a fresh one.
      const timer = setTimeout(
        () => this.retire(child, new Error("fitter timed out")),
        this.timeoutMs,
      );
      this.waiting.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ ...body, id })}\n`);
    });
  }

  stop() {
    this.child?.kill();
  }
}
