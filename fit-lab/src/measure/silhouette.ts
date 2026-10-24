import type { Mask, Span } from "../types";
import { median } from "./geometry";

export function spanWidth(s: Span): number {
  return s.right - s.left + 1;
}

/** First and last rows holding body pixels. */
export function verticalExtent(mask: Mask): { top: number; bottom: number } | null {
  const { width, height, data } = mask;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[row + x]) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  return top < 0 ? null : { top, bottom };
}

/**
 * The run of body pixels on row `y` that contains `x`, or the nearest run within
 * 3% of the image width when `x` itself is background.
 */
export function spanAt(mask: Mask, y: number, x: number): Span | null {
  const { width, height, data } = mask;
  const row = Math.round(y);
  if (row < 0 || row >= height) return null;
  const at = (i: number) => i >= 0 && i < width && data[row * width + i] === 1;

  let cx = Math.round(x);
  if (!at(cx)) {
    const reach = Math.ceil(width * 0.03);
    let found = -1;
    for (let d = 1; d <= reach && found < 0; d++) {
      if (at(cx - d)) found = cx - d;
      else if (at(cx + d)) found = cx + d;
    }
    if (found < 0) return null;
    cx = found;
  }
  let left = cx;
  let right = cx;
  while (at(left - 1)) left--;
  while (at(right + 1)) right++;
  return { y: row, left, right };
}

/** The span on row `y` whose width is the median of rows y-half..y+half, damping ragged mask edges. */
export function smoothedSpan(mask: Mask, y: number, x: number, half = 2): Span | null {
  const spans: Span[] = [];
  for (let dy = -half; dy <= half; dy++) {
    const s = spanAt(mask, y + dy, x);
    if (s) spans.push(s);
  }
  if (!spans.length) return null;
  const w = median(spans.map(spanWidth));
  const centre = spans.find((s) => s.y === Math.round(y)) ?? spans[0];
  const mid = (centre.left + centre.right) / 2;
  return {
    y: Math.round(y),
    left: Math.round(mid - (w - 1) / 2),
    right: Math.round(mid + (w - 1) / 2),
  };
}

/** The narrowest or widest smoothed span between rows y0 and y1. */
export function extremeSpan(
  mask: Mask,
  y0: number,
  y1: number,
  xAt: (y: number) => number,
  mode: "narrowest" | "widest",
): Span | null {
  let best: Span | null = null;
  for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) {
    const s = smoothedSpan(mask, y, xAt(y));
    if (!s) continue;
    if (!best) best = s;
    else if (mode === "narrowest" ? spanWidth(s) < spanWidth(best) : spanWidth(s) > spanWidth(best))
      best = s;
  }
  return best;
}

/**
 * The crotch: the first row below `fromY` where column `x` (between the legs)
 * turns to background for 3 rows. Null when the legs touch all the way down.
 */
export function crotchRow(mask: Mask, x: number, fromY: number, bottom: number): number | null {
  const { width, data } = mask;
  const cx = Math.round(x);
  const limit = bottom - 0.25 * (bottom - fromY);
  const empty = (y: number) => data[y * width + cx] === 0;
  for (let y = Math.max(0, Math.ceil(fromY)); y < limit; y++) {
    if (empty(y) && empty(y + 1) && empty(y + 2)) return y;
  }
  return null;
}
