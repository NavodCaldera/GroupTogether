import { describe, expect, it } from "vitest";
import { FitServer } from "./fit-server";

/** A stand-in for `fit.py --serve`: same line protocol, behaviour chosen by the request. */
const FAKE = `
const rl = require("node:readline").createInterface({ input: process.stdin });
console.log("banner noise that is not JSON");
console.log(JSON.stringify({ ready: true }));
rl.on("line", (line) => {
  const req = JSON.parse(line);
  if (req.crash) process.exit(3);
  if (req.hang) return;
  if (req.bad) return console.log(JSON.stringify({ id: req.id, error: "ValueError: height out of range" }));
  setTimeout(() => console.log(JSON.stringify({ id: req.id, result: { echo: req.n, pid: process.pid } })), req.wait || 0);
});
`;
const server = (timeoutMs = 5000) => new FitServer(process.execPath, ["-e", FAKE], timeoutMs);

describe("FitServer", () => {
  it("answers each request with its own result on one process", async () => {
    const s = server();
    try {
      const [a, b] = await Promise.all([s.request({ n: 1, wait: 60 }), s.request({ n: 2 })]);
      expect(a).toMatchObject({ echo: 1 });
      expect(b).toMatchObject({ echo: 2 });
      expect((a as { pid: number }).pid).toBe((b as { pid: number }).pid);
    } finally {
      s.stop();
    }
  });

  it("rejects a request the fitter refuses and keeps serving", async () => {
    const s = server();
    try {
      await expect(s.request({ bad: true })).rejects.toThrow("height out of range");
      expect(await s.request({ n: 3 })).toMatchObject({ echo: 3 });
    } finally {
      s.stop();
    }
  });

  it("starts a new process after a crash", async () => {
    const s = server();
    try {
      const before = (await s.request({ n: 1 })) as { pid: number };
      await expect(s.request({ crash: true })).rejects.toThrow(/exited/);
      const after = (await s.request({ n: 2 })) as { pid: number };
      expect(after.pid).not.toBe(before.pid);
    } finally {
      s.stop();
    }
  });

  it("kills a request that takes too long and recovers", async () => {
    const s = server(300);
    try {
      await expect(s.request({ hang: true })).rejects.toThrow(/timed out|exited/);
      expect(await s.request({ n: 4 })).toMatchObject({ echo: 4 });
    } finally {
      s.stop();
    }
  });
});
