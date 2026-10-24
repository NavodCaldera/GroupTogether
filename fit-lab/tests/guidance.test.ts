import { describe, expect, it } from "vitest";
import { positionPrompt, Stability } from "../src/live/guidance";
import { LiveSession } from "../src/live/session";
import { poseFaults, turnAngle } from "../src/measure/pose";
import { LM, type Landmark } from "../src/types";

// A standing person in a 3:4 portrait frame (aspect 0.75), normalized coordinates.
function person(
  o: { view?: "front" | "side"; scale?: number; dx?: number; armsOut?: boolean } = {},
) {
  const { view = "front", scale = 1, dx = 0, armsOut = true } = o;
  const cx = 0.5 + dx;
  const y = (v: number) => 0.5 + (v - 0.5) * scale;
  const half = view === "front" ? 0.1 : 0.01;
  const wrist = view === "front" ? (armsOut ? 0.2 : 0.12) : 0.01;
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: cx, y: y(0.5), visibility: 0.9 }));
  const at = (i: number, x: number, yy: number) => (lm[i] = { x, y: y(yy), visibility: 0.9 });
  at(LM.nose, cx, 0.14);
  at(LM.leftShoulder, cx + half, 0.24);
  at(LM.rightShoulder, cx - half, 0.24);
  at(LM.leftWrist, cx + wrist, 0.5);
  at(LM.rightWrist, cx - wrist, 0.5);
  at(LM.leftHip, cx + half * 0.5, 0.5);
  at(LM.rightHip, cx - half * 0.5, 0.5);
  for (const i of [LM.leftAnkle, 29, 31]) at(i, cx + 0.04, 0.9);
  for (const i of [LM.rightAnkle, 30, 32]) at(i, cx - 0.04, 0.9);
  return lm;
}

const A = 0.75;

describe("live position prompts", () => {
  it("accepts a good front and side position", () => {
    expect(positionPrompt("front", person(), 1, A)).toBeNull();
    expect(positionPrompt("side", person({ view: "side" }), 1, A)).toBeNull();
  });
  it("asks the person into frame and alone", () => {
    expect(positionPrompt("front", [], 0, A)).toBe("step_in");
    expect(positionPrompt("front", person(), 2, A)).toBe("one_person");
  });
  it("asks to move back, closer or to the centre", () => {
    expect(positionPrompt("front", person({ scale: 1.3 }), 1, A)).toBe("move_back");
    expect(positionPrompt("front", person({ scale: 0.6 }), 1, A)).toBe("move_closer");
    expect(positionPrompt("front", person({ dx: 0.25 }), 1, A)).toBe("centre");
  });
  it("asks for the whole body when the feet are hidden", () => {
    const lm = person();
    lm[LM.leftAnkle].visibility = 0.1;
    lm[LM.rightAnkle].visibility = 0.1;
    expect(positionPrompt("front", lm, 1, A)).toBe("whole_body");
  });
  it("asks to face the camera, turn sideways or hold the arms out", () => {
    expect(positionPrompt("front", person({ view: "side" }), 1, A)).toBe("face_camera");
    expect(positionPrompt("side", person(), 1, A)).toBe("turn_sideways");
    expect(positionPrompt("front", person({ armsOut: false }), 1, A)).toBe("arms_out");
  });
});

describe("stability", () => {
  it("is still only after the window with little movement", () => {
    const s = new Stability(800, 0.015);
    const lm = person();
    expect(s.push(0, lm, A)).toBe(false);
    for (let t = 100; t < 600; t += 100) expect(s.push(t, lm, A)).toBe(false);
    expect(s.push(600, lm, A)).toBe(true);
  });
  it("is not still while moving", () => {
    const s = new Stability(800, 0.015);
    for (let t = 0; t <= 1000; t += 100) {
      const lm = person({ dx: (t / 100) * 0.01 });
      expect(s.push(t, lm, A)).toBe(false);
    }
  });
});

describe("live session", () => {
  const run = (s: LiveSession, from: number, to: number, lm: Landmark[], people = 1) => {
    const steps = [];
    for (let t = from; t <= to; t += 100) steps.push({ t, ...s.step(t, lm, people, A) });
    return steps;
  };

  it("counts down while the position holds, then captures when still", () => {
    const s = new LiveSession("front");
    const steps = run(s, 0, 3000, person());
    expect(steps[0]).toMatchObject({ prompt: "stay_still", count: 3, ok: true, announce: true });
    expect(steps.find((x) => x.t === 1500)?.count).toBe(2);
    expect(steps.find((x) => x.t === 2900)?.count).toBe(1);
    expect(steps.filter((x) => x.capture).map((x) => x.t)).toEqual([3000]);
    expect(steps.at(-1)).toMatchObject({ prompt: "capturing", announce: true });
  });

  it("restarts the countdown when the position is lost", () => {
    const s = new LiveSession("front");
    run(s, 0, 2000, person());
    const lost = s.step(2100, person({ armsOut: false }), 1, A);
    expect(lost).toMatchObject({ prompt: "arms_out", ok: false, count: null, capture: false });
    const back = s.step(2200, person(), 1, A);
    expect(back).toMatchObject({ prompt: "stay_still", count: 3 });
  });

  it("waits for stillness after the countdown", () => {
    const s = new LiveSession("front");
    const steps = [];
    for (let t = 0; t <= 5000; t += 100) {
      // Sways until 3.5 s, then stands still.
      const dx = t < 3500 ? ((t / 100) % 2) * 0.02 : 0;
      steps.push({ t, ...s.step(t, person({ dx }), 1, A) });
    }
    expect(steps.find((x) => x.t === 3200)).toMatchObject({
      prompt: "stay_still",
      count: null,
      capture: false,
    });
    const first = steps.find((x) => x.capture);
    expect(first!.t).toBeGreaterThan(3500);
    expect(first!.t).toBeLessThanOrEqual(4200);
  });

  it("speaks a new position prompt only after it holds, and repeats it later", () => {
    const s = new LiveSession("front");
    const far = person({ scale: 0.6 });
    const steps = run(s, 0, 8000, far);
    expect(steps[0]).toMatchObject({ prompt: "move_closer", announce: false });
    expect(steps.filter((x) => x.announce).map((x) => x.t)).toEqual([600, 7700]);
  });
});

describe("pose checks", () => {
  const withPoints = (lm: Landmark[], changes: Record<number, Partial<Landmark>>) =>
    lm.map((p, i) => ({ ...p, ...changes[i] }));

  it("asks to move back when the shoulders or hips are hidden", () => {
    const lm = withPoints(person(), { [LM.leftHip]: { visibility: 0.1 } });
    expect(positionPrompt("front", lm, 1, A)).toBe("move_back");
  });

  it("checks the feet in the front view", () => {
    const cx = 0.5;
    const feet = (half: number) =>
      withPoints(person(), {
        [LM.leftAnkle]: { x: cx + half },
        [LM.rightAnkle]: { x: cx - half },
      });
    expect(positionPrompt("front", feet(0.01), 1, A)).toBe("feet_apart");
    expect(positionPrompt("front", feet(0.2), 1, A)).toBe("feet_closer");
  });

  it("asks for the arms down side-on", () => {
    const lm = withPoints(person({ view: "side" }), { [LM.leftWrist]: { x: 0.5 + 0.15 } });
    expect(positionPrompt("side", lm, 1, A)).toBe("arms_down");
  });

  it("uses the shoulder turn to tell front from side", () => {
    expect(turnAngle(undefined)).toBeNull();
    const world = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
    world[LM.leftShoulder] = { x: 0.18, y: 0, z: 0.02 };
    world[LM.rightShoulder] = { x: -0.18, y: 0, z: -0.02 };
    expect(turnAngle(world)).toBeLessThan(10);
    world[LM.leftShoulder] = { x: 0.02, y: 0, z: 0.18 };
    world[LM.rightShoulder] = { x: -0.02, y: 0, z: -0.18 };
    expect(turnAngle(world)).toBeGreaterThan(80);

    expect(positionPrompt("front", person(), 1, A, 60)).toBe("face_camera");
    expect(positionPrompt("side", person({ view: "side" }), 1, A, 20)).toBe("turn_sideways");
    expect(positionPrompt("side", person({ view: "side" }), 1, A, 85)).toBeNull();
  });

  it("reports the same faults on still photos", () => {
    const lm = withPoints(person(), {
      [LM.leftAnkle]: { x: 0.51 },
      [LM.rightAnkle]: { x: 0.49 },
    }).map((p) => ({ ...p, x: p.x * A }));
    expect(poseFaults("front", lm)).toContain("feet_together");
  });
});
