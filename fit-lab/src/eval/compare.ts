// Full vs Heavy (and Lite vs Full live) on the same images: processing time,
// capture success, landmark stability and measurement error against tape values.
import { estimateBody, type FrontMeasure, type PosePhoto } from "../measure/estimate";
import { verticalExtent } from "../measure/silhouette";
import { LM, type BodyKey, type Issue, type View } from "../types";
import { measurePhoto, usable } from "../ui/derive";
import type { PoseModel } from "../vision/mediapipe";

export interface StillRun extends PosePhoto {
  model: PoseModel;
  view: View;
  file: string;
  issues: Issue[];
  ms: { pose: number; total: number };
}

export interface LiveRun {
  model: PoseModel;
  view: View;
  file: string;
  ms: number;
  ok: boolean;
}

export const MEASURED: BodyKey[] = [
  "shoulder",
  "chest",
  "waist",
  "hip",
  "sleeve",
  "torso",
  "inseam",
];

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function meanSd(xs: number[]): { mean: number; sd: number } | null {
  if (!xs.length) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd =
    xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1)) : 0;
  return { mean, sd };
}

const KEY_POINTS = [
  LM.nose,
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
];

/**
 * Landmark jitter across photos of the same pose (a burst from a fixed phone):
 * mean standard deviation of key landmark positions, as % of body height.
 */
export function landmarkJitter(runs: PosePhoto[]): number | null {
  const ok = runs.filter((r) => r.landmarks.length >= 33);
  if (ok.length < 2) return null;
  const heights = ok.map((r) => {
    const e = verticalExtent(r.mask);
    return e ? e.bottom - e.top + 1 : r.mask.height;
  });
  const h = heights.reduce((a, b) => a + b, 0) / heights.length;
  const sds = KEY_POINTS.flatMap((i) => [
    meanSd(ok.map((r) => r.landmarks[i].x))!.sd,
    meanSd(ok.map((r) => r.landmarks[i].y))!.sd,
  ]);
  return (100 * sds.reduce((a, b) => a + b, 0)) / sds.length / h;
}

export interface MeasureSummary {
  key: BodyKey;
  n: number;
  mean: number;
  sd: number;
  /** Mean minus the tape value. */
  error: number | null;
}

export interface StillSummary {
  model: PoseModel;
  images: number;
  /** Share of images usable and measured. */
  success: number;
  poseMs: number | null;
  totalMs: number | null;
  jitter: Partial<Record<View, number | null>>;
  measures: MeasureSummary[];
}

/** Photo-only estimates (typed values are the ground truth, not inputs) per front/side pair. */
export function summarizeStill(
  model: PoseModel,
  runs: StillRun[],
  heightCm: number,
  truth: Partial<Record<BodyKey, number>>,
): StillSummary {
  const mine = runs.filter((r) => r.model === model);
  const byView = (v: View) => mine.filter((r) => r.view === v);
  const measured = mine.filter((r) => usable(r) && measurePhoto(r, heightCm).measure);
  const values: Partial<Record<BodyKey, number[]>> = {};
  const fronts = byView("front");
  const sides = byView("side");
  fronts.forEach((f, i) => {
    const fm = measurePhoto(f, heightCm);
    if (!fm.measure) return;
    const side = sides[i];
    const sm = side ? measurePhoto(side, heightCm, f) : null;
    const body = estimateBody({
      heightCm,
      typed: {},
      front: { measure: fm.measure as FrontMeasure, issues: fm.issues },
      side: sm?.measure ? { measure: sm.measure, issues: sm.issues } : null,
    });
    for (const k of MEASURED) if (body[k]) (values[k] ??= []).push(body[k]!.value);
  });

  return {
    model,
    images: mine.length,
    success: mine.length ? measured.length / mine.length : 0,
    poseMs: median(mine.map((r) => r.ms.pose)),
    totalMs: median(mine.map((r) => r.ms.total)),
    jitter: { front: landmarkJitter(fronts), side: landmarkJitter(sides) },
    measures: MEASURED.flatMap((key) => {
      const s = meanSd(values[key] ?? []);
      if (!s) return [];
      const t = truth[key];
      return [{ key, n: values[key]!.length, ...s, error: t ? s.mean - t : null }];
    }),
  };
}

export interface LiveSummary {
  model: PoseModel;
  frames: number;
  ms: number | null;
  /** Share of frames where the position was judged right. */
  ok: number;
}

export function summarizeLive(model: PoseModel, runs: LiveRun[]): LiveSummary {
  const mine = runs.filter((r) => r.model === model);
  return {
    model,
    frames: mine.length,
    ms: median(mine.map((r) => r.ms)),
    ok: mine.length ? mine.filter((r) => r.ok).length / mine.length : 0,
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(
  device: string,
  still: StillRun[],
  live: LiveRun[],
  summaries: StillSummary[],
): string {
  const rows: unknown[][] = [
    [
      "kind",
      "device",
      "model",
      "view",
      "file",
      "pose_ms",
      "total_ms",
      "ok",
      "issues",
      "key",
      "mean",
      "sd",
      "error",
    ],
  ];
  for (const r of still) {
    rows.push([
      "still",
      device,
      r.model,
      r.view,
      r.file,
      r.ms.pose.toFixed(1),
      r.ms.total.toFixed(1),
      usable(r) ? 1 : 0,
      r.issues.join(" "),
      "",
      "",
      "",
      "",
    ]);
  }
  for (const r of live) {
    rows.push([
      "live",
      device,
      r.model,
      r.view,
      r.file,
      r.ms.toFixed(1),
      "",
      r.ok ? 1 : 0,
      "",
      "",
      "",
      "",
      "",
    ]);
  }
  for (const s of summaries) {
    for (const m of s.measures) {
      rows.push([
        "measure",
        device,
        s.model,
        "",
        "",
        "",
        "",
        "",
        "",
        m.key,
        m.mean.toFixed(1),
        m.sd.toFixed(1),
        m.error === null ? "" : m.error.toFixed(1),
      ]);
    }
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
