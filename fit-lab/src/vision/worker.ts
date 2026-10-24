import { analyzeStill, detectLive, warmUp } from "./engine";
import type { VisionRequest, VisionResponse } from "./protocol";

const post = (msg: VisionResponse, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = async (e: MessageEvent<VisionRequest>) => {
  const req = e.data;
  try {
    if (req.type === "warm") {
      await warmUp(req.kind);
      post({ id: req.id, ok: true, result: null });
    } else if (req.type === "live") {
      post({ id: req.id, ok: true, result: await detectLive(req.frame, req.timestamp) });
    } else {
      const result = await analyzeStill(req.frame, req.view);
      post({ id: req.id, ok: true, result }, [result.mask.data.buffer]);
    }
  } catch (err) {
    post({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
