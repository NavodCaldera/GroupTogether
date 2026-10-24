import { describe, expect, it } from "vitest";
import {
  landmarkJitter,
  meanSd,
  median,
  summarizeLive,
  summarizeStill,
  toCsv,
  type LiveRun,
  type StillRun,
} from "../src/eval/compare";
import { FRONT, makeFigure, SIDE } from "./support/figure";

function run(view: "front" | "side", model: "full" | "heavy", shift = 0, poseMs = 100): StillRun {
  const fig = makeFigure({ view, profile: view === "front" ? FRONT : SIDE });
  return {
    ...fig,
    landmarks: fig.landmarks.map((p) => ({ ...p, x: p.x + shift })),
    model,
    view,
    file: `${view}-${shift}.jpg`,
    issues: [],
    ms: { pose: poseMs, total: poseMs * 2 },
  };
}

describe("stats", () => {
  it("median, mean and sd", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(meanSd([2, 4, 4, 4, 5, 5, 7, 9])).toMatchObject({ mean: 5 });
    expect(meanSd([2, 4, 4, 4, 5, 5, 7, 9])!.sd).toBeCloseTo(2.138, 3);
  });

  it("landmark jitter is zero for identical photos and grows with movement", () => {
    expect(landmarkJitter([run("front", "full")])).toBeNull();
    expect(landmarkJitter([run("front", "full"), run("front", "full")])).toBe(0);
    const j = landmarkJitter([run("front", "full", 0), run("front", "full", 9)])!;
    // x moves 9 px on a 900 px body: sd 6.36 px on x, 0 on y -> 0.35 %.
    expect(j).toBeCloseTo((100 * (Math.SQRT2 * 4.5)) / 2 / 900, 2);
  });
});

describe("model comparison", () => {
  const runs = [
    run("front", "full", 0, 80),
    run("front", "full", 3, 120),
    run("side", "full", 0, 80),
    run("side", "full", 3, 120),
    run("front", "heavy", 0, 300),
    { ...run("side", "heavy", 0, 300), issues: ["not_sideways" as const] },
  ];

  it("summarizes time, success, stability and error against tape", () => {
    const full = summarizeStill("full", runs, 180, { chest: 90 });
    expect(full).toMatchObject({ model: "full", images: 4, success: 1, poseMs: 100, totalMs: 200 });
    expect(full.jitter.front).toBeGreaterThan(0);
    const chest = full.measures.find((m) => m.key === "chest")!;
    expect(chest.n).toBe(2);
    expect(chest.error).toBeCloseTo(chest.mean - 90, 6);
    expect(full.measures.find((m) => m.key === "waist")!.error).toBeNull();

    const heavy = summarizeStill("heavy", runs, 180, {});
    expect(heavy).toMatchObject({ images: 2, success: 0.5, poseMs: 300 });
    // The unusable side photo leaves only front-only measurements.
    expect(heavy.measures.map((m) => m.key)).not.toContain("chest");
    expect(heavy.measures.map((m) => m.key)).toContain("shoulder");
  });

  it("summarizes live frames and writes a CSV", () => {
    const live: LiveRun[] = [
      { model: "lite", view: "front", file: "a.jpg", ms: 20, ok: true },
      { model: "lite", view: "front", file: "b.jpg", ms: 30, ok: false },
    ];
    expect(summarizeLive("lite", live)).toEqual({ model: "lite", frames: 2, ms: 25, ok: 0.5 });
    const csv = toCsv("Test phone", runs, live, [summarizeStill("full", runs, 180, { chest: 90 })]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "kind,device,model,view,file,pose_ms,total_ms,ok,issues,key,mean,sd,error",
    );
    expect(lines.filter((l) => l.startsWith("still,"))).toHaveLength(6);
    expect(lines.filter((l) => l.startsWith("live,"))).toHaveLength(2);
    expect(lines.some((l) => l.startsWith("measure,Test phone,full,,,,,,,chest,"))).toBe(true);
  });
});
