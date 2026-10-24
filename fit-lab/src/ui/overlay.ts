import type { FrontMeasure, SideMeasure } from "../measure/estimate";
import type { PhotoAnalysis } from "../vision/analyze";
import { LM, type Span } from "../types";

const LINE = { chest: "#f97316", waist: "#22c55e", hip: "#a855f7" } as const;

/** The photo with the body mask, the scale extent and the measured rows drawn on it. */
export function drawAnalysis(
  photo: PhotoAnalysis,
  measure: FrontMeasure | SideMeasure | null,
): HTMLCanvasElement {
  const { image, mask, landmarks } = photo;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);

  const tint = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;
    tint.data.set([31, 111, 235, 70], i * 4);
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
    const chain = (ids: number[]) => {
      ctx.beginPath();
      ids.forEach((id, i) =>
        (i ? ctx.lineTo : ctx.moveTo).call(ctx, landmarks[id].x, landmarks[id].y),
      );
      ctx.stroke();
    };
    chain([
      LM.leftWrist,
      LM.leftElbow,
      LM.leftShoulder,
      LM.rightShoulder,
      LM.rightElbow,
      LM.rightWrist,
    ]);
    chain([LM.leftShoulder, LM.leftHip, LM.rightHip, LM.rightShoulder]);
    for (const id of Object.values(LM)) {
      ctx.beginPath();
      ctx.arc(landmarks[id].x, landmarks[id].y, lw * 1.5, 0, Math.PI * 2);
      ctx.fill();
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
  return canvas;
}
