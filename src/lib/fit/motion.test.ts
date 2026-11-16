import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { BONES, CLIPS, clipFor, MOTION_IDS, poseAt } from "./motion";

describe("motion clips", () => {
  it("only move bones the body file has", () => {
    expect(BONES).toHaveLength(36);
    for (const id of MOTION_IDS)
      for (const track of CLIPS[id].tracks) {
        expect(BONES).toContain(track.bone);
        expect(track.degrees).toHaveLength(track.times.length);
        expect(track.times.at(-1)).toBeLessThanOrEqual(CLIPS[id].duration);
      }
  });

  it("loop without a jump", () => {
    for (const id of MOTION_IDS) expect(poseAt(id, 0)).toEqual(poseAt(id, CLIPS[id].duration));
  });

  it("walks with the legs opposite each other", () => {
    for (const t of [0, 0.1375, 0.275, 0.55, 0.825, 1]) {
      const pose = poseAt("WALK", t);
      expect(pose["upperleg01.L"][0]).toBeCloseTo(-pose["upperleg01.R"][0]);
    }
    expect(poseAt("WALK", 0.275)["upperleg01.L"][0]).toBeCloseTo(-25);
    expect(poseAt("WALK", 0.1375)["upperleg01.L"][0]).toBeCloseTo(-12.5);
  });

  it("sits with the thighs forward, the knees bent and the hips lowered", () => {
    const pose = poseAt("SIT", 2.5);
    expect(pose["upperleg01.L"][0]).toBeCloseTo(-90);
    expect(pose["lowerleg01.R"][0]).toBeCloseTo(90);
    expect(CLIPS.SIT.drop).toBeDefined();
    expect(pose["upperarm01.L"][2]).toBeCloseTo(-35); // arms at the sides, not held out
    expect(pose["upperarm01.R"][2]).toBeCloseTo(35);
  });

  it("reaches with both arms raised overhead from the sides", () => {
    const pose = poseAt("REACH", 1.6);
    expect(pose["upperarm01.L"][2]).toBeCloseTo(125);
    expect(pose["upperarm01.R"][2]).toBeCloseTo(-125);
  });

  it("walks and runs with the arms lowered to the sides, swinging against the legs", () => {
    for (const id of ["WALK", "RUN"] as const) {
      const quarter = poseAt(id, CLIPS[id].duration / 4);
      expect(quarter["upperarm01.L"][2]).toBeCloseTo(-35);
      expect(quarter["upperarm01.R"][2]).toBeCloseTo(35);
      expect(Math.sign(quarter["upperarm01.L"][0])).toBe(-Math.sign(quarter["upperleg01.L"][0]));
    }
  });
});

describe("clipFor", () => {
  it("names tracks the way the loader names bones and lowers the hips to sit", () => {
    const rest = { root: [0, 0.95, 0] as [number, number, number], thigh: 0.42 };
    const walk = clipFor(THREE, "WALK", rest);
    expect(walk.duration).toBeCloseTo(1.1);
    expect(walk.tracks.map((t) => t.name)).toContain("upperleg01L.quaternion");
    const sit = clipFor(THREE, "SIT", rest);
    const drop = sit.tracks.find((t) => t.name === "root.position")!;
    expect(Math.min(...Array.from(drop.values).filter((_, i) => i % 3 === 1))).toBeCloseTo(0.53);
    const thigh = sit.tracks.find((t) => t.name === "upperleg01L.quaternion")!;
    const q = new THREE.Quaternion().fromArray(thigh.values, 2 * 4);
    const foot = new THREE.Vector3(0, -1, 0).applyQuaternion(q);
    expect(foot.z).toBeCloseTo(1); // the thigh points forward
    // The body rests with its arms about 42 degrees out from hanging; at the top of the reach
    // the left arm points up.
    const reach = clipFor(THREE, "REACH", rest).tracks.find(
      (t) => t.name === "upperarm01L.quaternion",
    )!;
    const up = new THREE.Vector3(0.67, -0.74, 0).applyQuaternion(
      new THREE.Quaternion().fromArray(reach.values, 2 * 4),
    );
    expect(up.y).toBeGreaterThan(0.9);
  });
});
