import { LM, type Landmark, type Mask, type View } from "../../src/types";

// A synthetic person 900 px tall on a 600 x 1000 image, so 180 cm gives 0.2 cm/px.
export const W = 600;
export const H = 1000;
export const TOP = 50;
export const PX_HEIGHT = 900;
export const CX = 300;
export const SHOULDER_Y = TOP + 0.18 * PX_HEIGHT;
export const HIP_Y = TOP + 0.48 * PX_HEIGHT;
const TORSO = HIP_Y - SHOULDER_Y;

/** Torso widths (front) or depths (side) in px at the shoulder, chest, waist and hip rows. */
export interface Profile {
  shoulder: number;
  chest: number;
  waist: number;
  hip: number;
}

export interface FigureOptions {
  view: View;
  profile: Profile;
  /** Distance between the shoulder landmarks, px (front). */
  shoulderLm?: number;
  /** Shift the whole figure up by this many px (to crop the head). */
  shiftUp?: number;
}

function torsoWidth(y: number, p: Profile): number | null {
  const keys: [number, number][] = [
    [SHOULDER_Y, p.shoulder],
    [SHOULDER_Y + 0.28 * TORSO, p.chest],
    [SHOULDER_Y + 0.62 * TORSO, p.waist],
    [HIP_Y + 0.05 * TORSO, p.hip],
    [HIP_Y + 0.3 * TORSO, p.hip * 0.9],
  ];
  for (let i = 0; i < keys.length - 1; i++) {
    const [y0, w0] = keys[i];
    const [y1, w1] = keys[i + 1];
    if (y >= y0 && y <= y1) return w0 + ((y - y0) / (y1 - y0)) * (w1 - w0);
  }
  return null;
}

export function makeFigure({ view, profile, shoulderLm = 190, shiftUp = 0 }: FigureOptions) {
  const data = new Uint8Array(W * H);
  const fill = (y: number, x0: number, x1: number) => {
    const yy = Math.round(y) - shiftUp;
    if (yy < 0 || yy >= H) return;
    for (let x = Math.max(0, Math.ceil(x0)); x <= Math.min(W - 1, Math.floor(x1)); x++)
      data[yy * W + x] = 1;
  };
  const headR = 55;
  const legsFrom = HIP_Y + 0.3 * TORSO;
  for (let y = TOP; y < TOP + PX_HEIGHT; y++) {
    if (y <= TOP + 2 * headR) {
      const half = Math.sqrt(Math.max(0, headR * headR - (y - (TOP + headR)) ** 2));
      fill(y, CX - half, CX + half);
    } else if (y < SHOULDER_Y) {
      fill(y, CX - 30, CX + 30);
    } else if (y <= legsFrom) {
      const half = torsoWidth(y, profile)! / 2;
      fill(y, CX - half, CX + half);
    } else if (view === "front") {
      const leg = profile.hip * 0.4;
      fill(y, CX - profile.hip * 0.45, CX - profile.hip * 0.45 + leg);
      fill(y, CX + profile.hip * 0.45 - leg, CX + profile.hip * 0.45);
    } else {
      fill(y, CX - profile.hip * 0.3, CX + profile.hip * 0.3);
    }
  }
  const mask: Mask = { width: W, height: H, data };

  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: CX, y: HIP_Y, visibility: 0.9 }));
  const at = (i: number, x: number, y: number) => (lm[i] = { x, y: y - shiftUp, visibility: 0.9 });
  const half = view === "front" ? shoulderLm / 2 : 0;
  const hipHalf = view === "front" ? 45 : 0;
  at(LM.nose, CX, TOP + 60);
  at(LM.leftShoulder, CX + half, SHOULDER_Y);
  at(LM.rightShoulder, CX - half, SHOULDER_Y);
  // Arms out to the sides in front, hanging by the body side-on.
  const reach = view === "front" ? 1 : 0.15;
  at(LM.leftElbow, CX + half + 60 * reach, SHOULDER_Y + 140);
  at(LM.rightElbow, CX - half - 60 * reach, SHOULDER_Y + 140);
  at(LM.leftWrist, CX + half + 110 * reach, SHOULDER_Y + 270);
  at(LM.rightWrist, CX - half - 110 * reach, SHOULDER_Y + 270);
  at(LM.leftHip, CX + hipHalf, HIP_Y);
  at(LM.rightHip, CX - hipHalf, HIP_Y);
  at(LM.leftKnee, CX + hipHalf, (HIP_Y + TOP + PX_HEIGHT - 30) / 2);
  at(LM.rightKnee, CX - hipHalf, (HIP_Y + TOP + PX_HEIGHT - 30) / 2);
  at(LM.leftAnkle, CX + hipHalf, TOP + PX_HEIGHT - 30);
  at(LM.rightAnkle, CX - hipHalf, TOP + PX_HEIGHT - 30);
  return { mask, landmarks: lm };
}

/** 180 cm person: chest 32 x 24 cm, waist 28 x 22 cm, hip 35 x 26 cm (width x depth). */
export const FRONT: Profile = { shoulder: 230, chest: 160, waist: 140, hip: 175 };
export const SIDE: Profile = { shoulder: 100, chest: 120, waist: 110, hip: 130 };
