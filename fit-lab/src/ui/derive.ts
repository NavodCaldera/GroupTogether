import {
  estimateBody,
  measureFront,
  measureSide,
  type FrontMeasure,
  type SideMeasure,
} from "../measure/estimate";
import { BLOCKING } from "../measure/quality";
import type { Body, BodyKey, Issue, View } from "../types";
import type { PhotoAnalysis } from "../vision/analyze";

export type Photos = Partial<Record<View, PhotoAnalysis>>;

export interface Measured {
  measure: FrontMeasure | SideMeasure | null;
  issues: Issue[];
}

export function usable(p: PhotoAnalysis | undefined): p is PhotoAnalysis {
  return !!p && !p.issues.some((i) => BLOCKING.includes(i));
}

/** One photo's measurement; the side photo reuses the front photo's waist row. */
export function measurePhoto(
  photo: PhotoAnalysis,
  height: number,
  front?: PhotoAnalysis,
): Measured {
  if (!height || !usable(photo)) return { measure: null, issues: photo.issues };
  if (photo.view === "front") {
    const m = measureFront(photo, height);
    return {
      measure: m,
      issues: m?.armsTouching ? [...photo.issues, "arms_touching"] : photo.issues,
    };
  }
  const fm = front && usable(front) ? measureFront(front, height) : null;
  return { measure: measureSide(photo, height, fm?.waistAt ?? null), issues: photo.issues };
}

export function derive(photos: Photos, typed: Partial<Record<BodyKey, number>>) {
  const height = typed.height ?? 0;
  const front = photos.front ? measurePhoto(photos.front, height) : null;
  const side = photos.side ? measurePhoto(photos.side, height, photos.front) : null;
  const body: Body = estimateBody({
    heightCm: height,
    typed,
    front: front?.measure ? { measure: front.measure as FrontMeasure, issues: front.issues } : null,
    side: side?.measure ? { measure: side.measure, issues: side.issues } : null,
  });
  if (!height) delete body.height;
  return { front, side, body };
}
