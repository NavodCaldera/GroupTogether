import type { FrontMeasure, SideMeasure } from "../measure/estimate";
import { LM, type Landmark, type Span } from "../types";
import type { PhotoAnalysis } from "../vision/analyze";

const LINE = { chest: "#f97316", waist: "#22c55e", hip: "#a855f7" } as const;

const BONES: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [29, 31],
  [28, 30],
  [30, 32],
];

/** Live mode: the target zone and the skeleton, green when the position is right. */
export function drawLive(canvas: HTMLCanvasElement, lm: Landmark[], ok: boolean) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const color = ok ? "#22c55e" : "rgba(255,255,255,0.85)";
  const lw = Math.max(2, Math.round(Math.min(w, h) / 160));

  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.setLineDash([lw * 4, lw * 3]);
  ctx.strokeRect(w * 0.2, h * 0.03, w * 0.6, h * 0.94);
  ctx.setLineDash([]);

  if (lm.length < 33) return;
  ctx.lineWidth = lw * 1.5;
  ctx.lineCap = "round";
  for (const [a, b] of BONES) {
    if (lm[a].visibility < 0.5 || lm[b].visibility < 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(lm[LM.nose].x * w, lm[LM.nose].y * h, lw * 3, 0, Math.PI * 2);
  ctx.fill();
}

/** Capture mode: the photo with the body mask, the scale extent and the measured rows. */
export function drawAnalysis(
  canvas: HTMLCanvasElement,
  photo: PhotoAnalysis,
  measure: FrontMeasure | SideMeasure | null,
) {
  const { image, mask, landmarks } = photo;
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);

  const tint = new ImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i]) tint.data.set([31, 111, 235, 70], i * 4);
  }
  const layer = document.createElement("canvas");
  layer.width = mask.width;
  layer.height = mask.height;
  layer.getContext("2d")!.putImageData(tint, 0, 0);
  ctx.drawImage(layer, 0, 0);

  const lw = Math.max(2, Math.round(image.width / 300));
  ctx.lineWidth = lw;

  if (landmarks.length >= 33) {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.fillStyle = "#fff";
    for (const [a, b] of BONES) {
      ctx.beginPath();
      ctx.moveTo(landmarks[a].x, landmarks[a].y);
      ctx.lineTo(landmarks[b].x, landmarks[b].y);
      ctx.stroke();
    }
  }

  if (measure) {
    ctx.strokeStyle = "#facc15";
    ctx.setLineDash([lw * 4, lw * 3]);
    for (const y of [measure.top, measure.bottom]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const span = (s: Span, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw * 1.5;
      ctx.beginPath();
      ctx.moveTo(s.left, s.y);
      ctx.lineTo(s.right, s.y);
      ctx.stroke();
    };
    span(measure.chest, LINE.chest);
    span(measure.waist, LINE.waist);
    span(measure.hip, LINE.hip);
  }
}
