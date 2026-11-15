import type { Landmark, Mask } from "../types";

/**
 * What leaves the phone for the buyer's own 3D body (DEC-021): the body outline as pixel runs
 * and the pose joints, downsampled. Never the photo itself.
 */
export interface Outline {
  width: number;
  height: number;
  /** Runs of body pixels, [row, left, right] inclusive. */
  spans: [number, number, number][];
  /** The 33 pose landmarks in the same pixels, [x, y, visibility]. */
  landmarks: [number, number, number][];
}

/** Outlines are sent this many rows tall (about 10 KB each). */
export const OUTLINE_ROWS = 512;

const r1 = (n: number) => Math.round(n * 10) / 10;

export function outlineFor(
  photo: { mask: Mask; landmarks: Landmark[] },
  rows = OUTLINE_ROWS,
): Outline {
  const { mask } = photo;
  const scale = Math.min(1, rows / mask.height);
  const width = Math.max(1, Math.round(mask.width * scale));
  const height = Math.max(1, Math.round(mask.height * scale));
  const spans: Outline["spans"] = [];
  for (let y = 0; y < height; y++) {
    const sy = Math.min(mask.height - 1, Math.floor((y + 0.5) / scale));
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const sx = Math.min(mask.width - 1, Math.floor((x + 0.5) / scale));
      const on = x < width && mask.data[sy * mask.width + sx] === 1;
      if (on && start < 0) start = x;
      else if (!on && start >= 0) {
        spans.push([y, start, x - 1]);
        start = -1;
      }
    }
  }
  return {
    width,
    height,
    spans,
    landmarks: photo.landmarks.map((l) => [r1(l.x * scale), r1(l.y * scale), r1(l.visibility)]),
  };
}
