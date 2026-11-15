import { poseFaults, type PoseFault } from "../measure/pose";
import { LM, type Landmark, type View } from "../types";

export type Prompt =
  | "step_in"
  | "one_person"
  | "move_back"
  | "whole_body"
  | "move_closer"
  | "centre"
  | "face_camera"
  | "turn_sideways"
  | "arms_out"
  | "arms_down"
  | "feet_apart"
  | "feet_closer"
  | "stand_straight"
  | "stay_still"
  | "capturing";

export const PROMPT_TEXT: Record<Prompt, string> = {
  step_in: "Step into the frame",
  one_person: "Only one person in view",
  move_back: "Move back",
  whole_body: "Keep your whole body visible",
  move_closer: "Move closer",
  centre: "Move to the centre",
  face_camera: "Face the camera",
  turn_sideways: "Turn sideways",
  arms_out: "Hold your arms slightly out",
  arms_down: "Keep your arms down by your sides",
  feet_apart: "Stand with your feet slightly apart",
  feet_closer: "Bring your feet closer together",
  stand_straight: "Stand straight",
  stay_still: "Stay still",
  capturing: "Capturing now",
};

const FEET = [27, 28, 29, 30, 31, 32];

/** Whole-body extent from landmarks: the head top sits above the nose by ~0.6 of nose-to-shoulders. */
export function bodyExtent(lm: Landmark[]) {
  const shoulderY = (lm[LM.leftShoulder].y + lm[LM.rightShoulder].y) / 2;
  const top = lm[LM.nose].y - 0.6 * (shoulderY - lm[LM.nose].y);
  const bottom = Math.max(...FEET.map((i) => lm[i].y));
  return { top, bottom, span: bottom - top };
}

const FAULT_PROMPT: Record<PoseFault, Prompt> = {
  core_hidden: "move_back",
  limbs_hidden: "whole_body",
  not_facing: "face_camera",
  not_sideways: "turn_sideways",
  arms_in: "arms_out",
  arms_not_down: "arms_down",
  feet_together: "feet_apart",
  feet_wide: "feet_closer",
  leaning: "stand_straight",
};

/**
 * The first thing the person should fix, or null when the position is right.
 * Landmarks are normalized 0..1; `aspect` is frame width / height so x and y
 * distances can be compared. `turn` is the shoulder rotation from world landmarks.
 */
export function positionPrompt(
  view: View,
  lm: Landmark[],
  people: number,
  aspect: number,
  turn: number | null = null,
): Prompt | null {
  if (!people || lm.length < 33) return "step_in";
  if (people > 1) return "one_person";

  const u = lm.map((p) => ({ ...p, x: p.x * aspect }));
  const faults = poseFaults(view, u, turn);
  // Shoulders and hips hidden: usually too close.
  if (faults[0] === "core_hidden") return "move_back";

  const { top, bottom, span } = bodyExtent(lm);
  if (span > 0.92 || (top < 0.02 && bottom > 0.98)) return "move_back";
  if (top < 0.02 || bottom > 0.98 || lm[LM.nose].visibility < 0.5) return "whole_body";
  if (faults.includes("limbs_hidden")) return "whole_body";
  if (span < 0.55) return "move_closer";

  const hipX = (lm[LM.leftHip].x + lm[LM.rightHip].x) / 2;
  if (hipX < 0.3 || hipX > 0.7) return "centre";

  return faults.length ? FAULT_PROMPT[faults[0]] : null;
}

const TRACKED = [
  LM.nose,
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftHip,
  LM.rightHip,
  LM.leftAnkle,
  LM.rightAnkle,
];

/** Still when the tracked points moved less than `tolerance` of body height over the last `windowMs`. */
export class Stability {
  private samples: { t: number; pts: { x: number; y: number }[]; span: number }[] = [];

  constructor(
    private windowMs = 800,
    private tolerance = 0.015,
  ) {}

  reset() {
    this.samples = [];
  }

  push(t: number, lm: Landmark[], aspect: number): boolean {
    const pts = TRACKED.map((i) => ({ x: lm[i].x * aspect, y: lm[i].y }));
    this.samples.push({ t, pts, span: bodyExtent(lm).span });
    while (this.samples.length && this.samples[0].t < t - this.windowMs) this.samples.shift();
    const first = this.samples[0];
    if (this.samples.length < 4 || t - first.t < this.windowMs * 0.75) return false;
    const last = this.samples[this.samples.length - 1];
    const limit = this.tolerance * last.span;
    return this.samples.every((s) =>
      s.pts.every((p, i) => Math.hypot(p.x - last.pts[i].x, p.y - last.pts[i].y) < limit),
    );
  }
}
