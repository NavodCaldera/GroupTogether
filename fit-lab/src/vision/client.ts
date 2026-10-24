import type { View } from "../types";
import type { LiveResult, StillResult } from "./engine";
import type { PoseKind } from "./mediapipe";
import type { VisionRequest, VisionResponse } from "./protocol";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type Payload = VisionRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, "id">
    : never
  : never;

/**
 * Sends frames to the vision worker. If the worker can't start or MediaPipe
 * fails inside it, every later call runs on the main thread instead.
 */
class VisionClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    if (typeof Worker === "undefined") return;
    try {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<VisionResponse>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.result);
        else p.reject(new Error(e.data.error));
      };
      this.worker.onerror = () => this.fallBack(new Error("Vision worker failed"));
    } catch {
      this.worker = null;
    }
  }

  get mode(): "worker" | "main" {
    return this.worker ? "worker" : "main";
  }

  private fallBack(err: Error) {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private async inline(req: Payload): Promise<unknown> {
    const engine = await import("./engine");
    if (req.type === "warm") return engine.warmUp(req.kind);
    if (req.type === "live") return engine.detectLive(req.frame, req.timestamp);
    return engine.analyzeStill(req.frame, req.view);
  }

  private async call<T>(req: Payload, transfer: Transferable[]): Promise<T> {
    if (!this.worker) return (await this.inline(req)) as T;
    const worker = this.worker;
    const id = this.nextId++;
    try {
      return await new Promise<T>((resolve, reject) => {
        this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        worker.postMessage({ ...req, id }, transfer);
      });
    } catch (err) {
      // Frames were transferred to the worker, so a failed call can't be retried here.
      if (this.worker === worker && req.type === "warm") {
        this.fallBack(err as Error);
        return (await this.inline(req)) as T;
      }
      throw err;
    }
  }

  /** Loads the models ahead of use; falls back to the main thread if the worker can't. */
  warm(kind: PoseKind): Promise<void> {
    return this.call({ type: "warm", kind }, []);
  }

  live(frame: ImageBitmap, timestamp: number): Promise<LiveResult> {
    return this.call({ type: "live", frame, timestamp }, [frame]);
  }

  still(frame: ImageBitmap, view: View): Promise<StillResult> {
    return this.call({ type: "still", frame, view }, [frame]);
  }
}

export const vision = new VisionClient();
