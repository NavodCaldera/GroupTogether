import { describe, expect, it } from "vitest";
import { CAL } from "../src/calibration";
import { estimateBody, measureFront, measureSide } from "../src/measure/estimate";
import { ellipsePerimeter, normalCdf, probBetween } from "../src/measure/geometry";
import { poseIssues } from "../src/measure/quality";
import { spanAt, spanWidth, verticalExtent } from "../src/measure/silhouette";
import { LM } from "../src/types";
import { CX, FRONT, makeFigure, SHOULDER_Y, SIDE, TOP } from "./support/figure";

describe("geometry", () => {
  it("ellipse perimeter of a circle is 2πr", () => {
    expect(ellipsePerimeter(10, 10)).toBeCloseTo(2 * Math.PI * 10, 6);
  });
  it("ellipse perimeter matches a known value", () => {
    expect(ellipsePerimeter(16, 12)).toBeCloseTo(88.41, 2);
  });
  it("normal probabilities", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(probBetween(0, 1, -1, 1)).toBeCloseTo(0.6827, 3);
    expect(probBetween(5, 0, 0, 10)).toBe(1);
  });
});

describe("silhouette", () => {
  const { mask } = makeFigure({ view: "front", profile: FRONT });
  it("finds the body's vertical extent", () => {
    expect(verticalExtent(mask)).toEqual({ top: TOP, bottom: TOP + 899 });
  });
  it("finds the run containing a point and snaps to a nearby run", () => {
    const s = spanAt(mask, 400, CX)!;
    expect(s.left).toBeLessThan(CX);
    expect(s.right).toBeGreaterThan(CX);
    expect(spanAt(mask, 900, CX)).not.toBeNull(); // between the legs, snaps to one leg
    expect(spanAt(mask, 5, CX)).toBeNull();
  });
});

describe("measurements from photos", () => {
  const front = makeFigure({ view: "front", profile: FRONT });
  const side = makeFigure({ view: "side", profile: SIDE });
  const f = measureFront(front, 180)!;
  const s = measureSide(side, 180, f.waistAt)!;

  it("scales by the known height", () => {
    expect(f.cmPerPx).toBeCloseTo(0.2, 6);
  });

  it("finds chest, waist and hip widths and depths", () => {
    const cm = (px: number) => px * 0.2;
    expect(cm(spanWidth(f.chest))).toBeCloseTo(32, 0);
    expect(cm(spanWidth(f.waist))).toBeCloseTo(28, 0);
    expect(cm(spanWidth(f.hip))).toBeCloseTo(35, 0);
    expect(cm(spanWidth(s.chest))).toBeCloseTo(24, 0);
    expect(cm(spanWidth(s.waist))).toBeCloseTo(22, 0);
    expect(cm(spanWidth(s.hip))).toBeCloseTo(26, 0);
    expect(f.armsTouching).toBe(false);
  });

  it("turns widths and depths into circumferences and lengths", () => {
    const body = estimateBody({
      heightCm: 180,
      typed: {},
      front: { measure: f, issues: [] },
      side: { measure: s, issues: [] },
    });
    expect(body.chest!.value).toBeCloseTo(ellipsePerimeter(16, 12) * CAL.circumference.chest, -0.3);
    expect(body.waist!.value).toBeCloseTo(ellipsePerimeter(14, 11) * CAL.circumference.waist, -0.3);
    expect(body.hip!.value).toBeCloseTo(ellipsePerimeter(17.5, 13) * CAL.circumference.hip, -0.3);
    // Shoulder from the outline just below the shoulder landmarks (217 px there).
    expect(body.shoulder).toMatchObject({ method: "outline" });
    expect(body.shoulder!.value).toBeCloseTo(217 * 0.2 * CAL.shoulderOutlineFactor, 0);
    // Inseam from the crotch (row 564) to the soles (row 949).
    expect(body.inseam).toMatchObject({ method: "outline" });
    expect(body.inseam!.value).toBeCloseTo((949 - 564) * 0.2, 3);
    // Arm and torso lengths only from joints, with a wider spread.
    expect(body.sleeve).toMatchObject({ method: "joints" });
    expect(body.sleeve!.value).toBeCloseTo((Math.hypot(60, 140) + Math.hypot(50, 130)) * 0.2, 3);
    expect(body.sleeve!.sd).toBeCloseTo(CAL.sd.sleeve * CAL.jointsSdFactor, 6);
    expect(body.torso).toMatchObject({ method: "joints", value: 270 * 0.2 });
    expect(body.chest).toMatchObject({ source: "photo", method: "outline", sd: CAL.sd.chest });
  });

  it("falls back to joints when the outline can't be read", () => {
    const fig = makeFigure({ view: "front", profile: FRONT });
    const w = fig.mask.width;
    // Legs together: fill the gap between them.
    for (let y = 564; y < 950; y++)
      for (let x = CX - 20; x <= CX + 20; x++) fig.mask.data[y * w + x] = 1;
    // Arms raised level with the shoulders: the outline there runs out along the arms.
    const row = Math.round(SHOULDER_Y + CAL.shoulderRowAt * 270);
    for (let y = row - 8; y <= row + 8; y++)
      for (let x = 20; x < w - 20; x++) fig.mask.data[y * w + x] = 1;
    const m = measureFront(fig, 180)!;
    expect(m.crotchY).toBeNull();
    expect(m.shoulder).toBeNull();
    const body = estimateBody({ heightCm: 180, typed: {}, front: { measure: m, issues: [] } });
    expect(body.inseam).toMatchObject({ method: "joints" });
    expect(body.inseam!.value).toBeCloseTo((949 - 482) * 0.2 - CAL.crotchDropCm, 0);
    expect(body.shoulder).toMatchObject({ method: "joints" });
    expect(body.shoulder!.value).toBeCloseTo(190 * 0.2 * CAL.shoulderJointFactor, 3);
  });

  it("stops the hip search short of the knees", () => {
    const fig = makeFigure({ view: "front", profile: FRONT });
    // Knees just below the hips: the widest row must stay within half-way to them.
    fig.landmarks[LM.leftKnee] = { ...fig.landmarks[LM.leftKnee], y: 482 + 40 };
    fig.landmarks[LM.rightKnee] = { ...fig.landmarks[LM.rightKnee], y: 482 + 40 };
    expect(measureFront(fig, 180)!.hip.y).toBeLessThanOrEqual(482 + 20);
  });

  it("has no circumferences without a side photo", () => {
    const body = estimateBody({ heightCm: 180, typed: {}, front: { measure: f, issues: [] } });
    expect(body.chest).toBeUndefined();
    expect(body.shoulder).toBeDefined();
  });

  it("widens the uncertainty for each photo issue", () => {
    const body = estimateBody({
      heightCm: 180,
      typed: {},
      front: { measure: f, issues: ["blurry"] },
      side: { measure: s, issues: ["leaning"] },
    });
    expect(body.chest!.sd).toBeCloseTo(CAL.sd.chest * (1 + 2 * CAL.issuePenalty), 6);
    expect(body.shoulder!.sd).toBeCloseTo(CAL.sd.shoulder * (1 + CAL.issuePenalty), 6);
  });

  it("prefers typed values and flags a large disagreement", () => {
    const front2 = { measure: f, issues: [] };
    const side2 = { measure: s, issues: [] };
    const close = estimateBody({ heightCm: 180, typed: { chest: 95 }, front: front2, side: side2 });
    expect(close.chest).toMatchObject({ value: 95, source: "typed", mismatch: false });
    const far = estimateBody({ heightCm: 180, typed: { chest: 120 }, front: front2, side: side2 });
    expect(far.chest).toMatchObject({ value: 120, source: "typed", mismatch: true });
  });

  it("notices an arm merged into the torso", () => {
    const fig = makeFigure({ view: "front", profile: FRONT });
    const w = fig.landmarks[LM.leftWrist];
    // Move the wrist onto the waist and join it to the torso.
    const y = Math.round(f.waist.y);
    fig.landmarks[LM.leftWrist] = { ...w, x: f.waist.right + 20, y };
    for (let yy = y - 15; yy <= y + 15; yy++) {
      for (let x = f.waist.right; x <= f.waist.right + 30; x++)
        fig.mask.data[yy * fig.mask.width + x] = 1;
    }
    expect(measureFront(fig, 180)!.armsTouching).toBe(true);
  });
});

describe("photo checks", () => {
  const front = makeFigure({ view: "front", profile: FRONT });
  const side = makeFigure({ view: "side", profile: SIDE });

  it("accepts good front and side photos", () => {
    expect(poseIssues("front", front.landmarks, front.mask, 1)).toEqual([]);
    expect(poseIssues("side", side.landmarks, side.mask, 1)).toEqual([]);
  });
  it("catches the wrong view", () => {
    expect(poseIssues("front", side.landmarks, side.mask, 1)).toContain("not_facing");
    expect(poseIssues("side", front.landmarks, front.mask, 1)).toContain("not_sideways");
  });
  it("catches a cropped head, no person and several people", () => {
    const cropped = makeFigure({ view: "front", profile: FRONT, shiftUp: 60 });
    expect(poseIssues("front", cropped.landmarks, cropped.mask, 1)).toContain("not_full_body");
    expect(poseIssues("front", [], front.mask, 0)).toEqual(["no_person"]);
    expect(poseIssues("front", front.landmarks, front.mask, 2)).toContain("several_people");
  });
});
