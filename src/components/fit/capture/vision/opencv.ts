type CV = typeof import("@techstark/opencv-js");

let loading: Promise<CV> | null = null;

/** OpenCV.js is ~10 MB, so it loads on first use. Its default export is a promise, a module or a not-yet-ready module depending on version. */
export function loadCv(): Promise<CV> {
  loading ??= import("@techstark/opencv-js").then(async (mod) => {
    const m = ((mod as { default?: unknown }).default ?? mod) as CV & {
      onRuntimeInitialized?: () => void;
    };
    if (m instanceof Promise) return (await m) as CV;
    if ((m as { Mat?: unknown }).Mat) return m;
    await new Promise<void>((resolve) => (m.onRuntimeInitialized = resolve));
    return m;
  });
  return loading;
}

export interface MaskOptions {
  threshold: number;
  /** Opening/closing kernel size, px. */
  kernel: number;
  /** Enclosed gaps at least this share of the image are kept as background. */
  minGap: number;
  /** A point on the torso; the region containing it is the person. */
  seed: { x: number; y: number } | null;
}

/**
 * Probability mask -> binary person mask:
 * threshold, small opening (specks) then closing (small breaks), keep the
 * region containing the torso, and refill only small holes. Large enclosed
 * gaps (between an arm and the body, between the legs) are real and stay.
 * Every step moves the boundary a little, so the kernel stays small.
 */
export function cleanMask(
  cv: CV,
  probs: Float32Array,
  width: number,
  height: number,
  opts: MaskOptions,
): Uint8Array {
  const src = new cv.Mat(height, width, cv.CV_8UC1);
  const out = cv.Mat.zeros(height, width, cv.CV_8UC1);
  const holes = cv.Mat.zeros(height, width, cv.CV_8UC1);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const k = Math.max(1, Math.round(opts.kernel)) | 1;
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k));
  try {
    for (let i = 0; i < probs.length; i++) src.data[i] = probs[i] > opts.threshold ? 255 : 0;
    if (k > 1) {
      cv.morphologyEx(src, src, cv.MORPH_OPEN, kernel);
      cv.morphologyEx(src, src, cv.MORPH_CLOSE, kernel);
    }
    // Two levels: outer outlines, and the holes inside them.
    cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
    const h = hierarchy.data32S;
    const firstChild = (i: number) => h[i * 4 + 2];
    const next = (i: number) => h[i * 4];
    const parent = (i: number) => h[i * 4 + 3];

    let chosen = -1;
    let largest = -1;
    let largestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      if (parent(i) !== -1) continue;
      const c = contours.get(i);
      const area = cv.contourArea(c);
      const inside =
        opts.seed && cv.pointPolygonTest(c, new cv.Point(opts.seed.x, opts.seed.y), false) >= 0;
      c.delete();
      if (inside && chosen < 0) chosen = i;
      if (area > largestArea) {
        largestArea = area;
        largest = i;
      }
    }
    if (chosen < 0) chosen = largest;
    if (chosen >= 0) {
      cv.drawContours(out, contours, chosen, new cv.Scalar(255), cv.FILLED);
      const minArea = opts.minGap * width * height;
      for (let j = firstChild(chosen); j !== -1; j = next(j)) {
        const hole = contours.get(j);
        const area = cv.contourArea(hole);
        hole.delete();
        if (area < minArea) cv.drawContours(holes, contours, j, new cv.Scalar(255), cv.FILLED);
      }
    }
    // Region ∧ (mask ∨ small holes): large gaps stay background, the boundary is untouched.
    const result = new Uint8Array(width * height);
    for (let i = 0; i < result.length; i++) {
      result[i] = out.data[i] && (src.data[i] || holes.data[i]) ? 1 : 0;
    }
    return result;
  } finally {
    [src, out, holes, contours, hierarchy, kernel].forEach((m) => m.delete());
  }
}

/** Sharpness (variance of the Laplacian at 640 px tall) and mean brightness 0-255. */
export function imageQuality(cv: CV, pixels: ImageData): { sharpness: number; brightness: number } {
  const rgba = cv.matFromImageData(pixels);
  const gray = new cv.Mat();
  const small = new cv.Mat();
  const lap = new cv.Mat();
  const mean = new cv.Mat();
  const sd = new cv.Mat();
  try {
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    const scale = 640 / gray.rows;
    cv.resize(gray, small, new cv.Size(Math.round(gray.cols * scale), 640), 0, 0, cv.INTER_AREA);
    cv.Laplacian(small, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, sd);
    const sharpness = sd.doubleAt(0, 0) ** 2;
    cv.meanStdDev(small, mean, sd);
    return { sharpness, brightness: mean.doubleAt(0, 0) };
  } finally {
    [rgba, gray, small, lap, mean, sd].forEach((m) => m.delete());
  }
}
