// How the person is standing, from pose landmarks. Shared by live guidance and
// still-photo checks. Pose says where the body is, not how big it is.
import { LM, type Landmark, type View, type WorldPoint } from "../types";

/** Ordered by what the person should fix first. */
export type PoseFault =
  | "core_hidden"
  | "limbs_hidden"
  | "not_facing"
  | "not_sideways"
  | "arms_in"
  | "arms_not_down"
  | "feet_together"
  | "feet_wide"
  | "leaning";

const VISIBLE = 0.5;

// Thresholds as fractions of torso length (shoulder line to hip line).
const FACING_MIN = 0.45;
const SIDEWAYS_MAX = 0.3;
const FEET_MIN = 0.2;
const FEET_MAX = 0.8;
const ARMS_DOWN_MAX = 0.35;
const LEAN_MAX = 0.2;
// Shoulder-line rotation from the camera plane, degrees, from world landmarks.
const FRONT_TURN_MAX = 35;
const SIDE_TURN_MIN = 45;

/**
 * Shoulder-line rotation away from the camera plane, 0° facing, 90° side-on.
 * Uses MediaPipe's estimated world depth, so only for telling views apart.
 */
export function turnAngle(world: WorldPoint[] | undefined): number | null {
  if (!world || world.length < 33) return null;
  const l = world[LM.leftShoulder];
  const r = world[LM.rightShoulder];
  return (Math.atan2(Math.abs(l.z - r.z), Math.abs(l.x - r.x)) * 180) / Math.PI;
}

const mid = (a: Landmark, b: Landmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Pose faults for a view. `lm` must use the same unit on both axes (pixels, or
 * normalized x multiplied by the frame aspect).
 */
export function poseFaults(view: View, lm: Landmark[], turn: number | null = null): PoseFault[] {
  const faults: PoseFault[] = [];
  const seen = (i: number) => lm[i].visibility >= VISIBLE;
  // Side-on, the far limb is hidden; one of each pair is enough.
  const pair = (a: number, b: number) =>
    view === "front" ? seen(a) && seen(b) : seen(a) || seen(b);

  if (!pair(LM.leftShoulder, LM.rightShoulder) || !pair(LM.leftHip, LM.rightHip)) {
    return ["core_hidden"];
  }
  if (!pair(LM.leftKnee, LM.rightKnee) || !pair(LM.leftAnkle, LM.rightAnkle)) {
    faults.push("limbs_hidden");
  }

  const ls = lm[LM.leftShoulder];
  const rs = lm[LM.rightShoulder];
  const shoulder = mid(ls, rs);
  const hip = mid(lm[LM.leftHip], lm[LM.rightHip]);
  const torso = Math.max(hip.y - shoulder.y, 1e-6);
  const across = Math.abs(ls.x - rs.x) / torso;

  if (view === "front" && (across < FACING_MIN || (turn !== null && turn > FRONT_TURN_MAX))) {
    faults.push("not_facing");
  }
  if (view === "side" && (across > SIDEWAYS_MAX || (turn !== null && turn < SIDE_TURN_MIN))) {
    faults.push("not_sideways");
  }

  if (view === "front") {
    // Wrists clear of the waist: a hanging arm sits ~1.2 shoulder half-widths out.
    const half = Math.abs(ls.x - rs.x) / 2;
    const clear = [LM.leftWrist, LM.rightWrist].every(
      (i) => Math.abs(lm[i].x - shoulder.x) > 1.4 * half,
    );
    if (!clear) faults.push("arms_in");

    const feet = Math.abs(lm[LM.leftAnkle].x - lm[LM.rightAnkle].x) / torso;
    if (feet < FEET_MIN) faults.push("feet_together");
    if (feet > FEET_MAX) faults.push("feet_wide");
  } else {
    const out = [LM.leftWrist, LM.rightWrist, LM.leftElbow, LM.rightElbow]
      .filter((i) => seen(i))
      .some((i) => Math.abs(lm[i].x - hip.x) / torso > ARMS_DOWN_MAX);
    if (out) faults.push("arms_not_down");
  }

  const ankle = mid(lm[LM.leftAnkle], lm[LM.rightAnkle]);
  if (Math.abs(shoulder.x - ankle.x) / torso > LEAN_MAX) faults.push("leaning");
  return faults;
}
