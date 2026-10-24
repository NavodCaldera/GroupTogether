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

/**
 * Closes small gaps, drops specks and keeps the largest body region, filled.
 * Filling also closes holes, e.g. a dark belt the segmenter missed.
 */
export function cleanMask(cv: CV, raw: Uint8Array, width: number, height: number): Uint8Array {
  const src = new cv.Mat(height, width, cv.CV_8UC1);
  const work = new cv.Mat();
  const out = cv.Mat.zeros(height, width, cv.CV_8UC1);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const k = Math.max(3, Math.round(Math.min(width, height) / 150)) | 1;
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k));
  try {
    for (let i = 0; i < raw.length; i++) src.data[i] = raw[i] ? 255 : 0;
    cv.morphologyEx(src, work, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(work, work, cv.MORPH_OPEN, kernel);
    cv.findContours(work, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let best = -1;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      c.delete();
      if (area > bestArea) {
        bestArea = area;
        best = i;
      }
    }
    if (best >= 0) cv.drawContours(out, contours, best, new cv.Scalar(255), cv.FILLED);
    const result = new Uint8Array(width * height);
    for (let i = 0; i < result.length; i++) result[i] = out.data[i] ? 1 : 0;
    return result;
  } finally {
    [src, work, out, contours, hierarchy, kernel].forEach((m) => m.delete());
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
