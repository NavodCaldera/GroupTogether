/**
 * Walk, run, reach and sit for a body file with a skeleton (DEC-021). One set of clips moves every
 * body, the buyer's own and the standard ones: the bones are named and ordered as in
 * tools/body-fitting/skin.py `BONES` (a test keeps the two lists equal).
 *
 * Angles are Euler XYZ in degrees about the file's axes: X to the body's left, Y up, Z forward.
 * A leg or arm hanging down swings forward with a negative X angle; a knee bends with a positive
 * one. Bones in the file have no rest rotation, so these are plain world-axis turns at each joint.
 */
import type * as Three from "three";

export const BONES = [
  "root",
  "pelvis.L",
  "upperleg01.L",
  "upperleg02.L",
  "lowerleg01.L",
  "lowerleg02.L",
  "foot.L",
  "pelvis.R",
  "upperleg01.R",
  "upperleg02.R",
  "lowerleg01.R",
  "lowerleg02.R",
  "foot.R",
  "spine05",
  "spine04",
  "spine03",
  "spine02",
  "spine01",
  "clavicle.L",
  "shoulder01.L",
  "upperarm01.L",
  "upperarm02.L",
  "lowerarm01.L",
  "lowerarm02.L",
  "wrist.L",
  "clavicle.R",
  "shoulder01.R",
  "upperarm01.R",
  "upperarm02.R",
  "lowerarm01.R",
  "lowerarm02.R",
  "wrist.R",
  "neck01",
  "neck02",
  "neck03",
  "head",
] as const;
export type Bone = (typeof BONES)[number];

export const MOTION_IDS = ["WALK", "RUN", "REACH", "SIT"] as const;
export type Motion = (typeof MOTION_IDS)[number];

type Angles = [number, number, number];
interface Track {
  bone: Bone;
  times: number[];
  degrees: Angles[];
}
export interface Clip {
  duration: number;
  tracks: Track[];
  /** How far the hips come down, in thigh lengths, at each time (sitting). */
  drop?: { times: number[]; values: number[] };
}

/** A track turning about X only. */
const x = (bone: Bone, times: number[], angles: number[]): Track => ({
  bone,
  times,
  degrees: angles.map((a) => [a, 0, 0]),
});
const mirror = (angles: number[]) => angles.map((a) => (a === 0 ? 0 : -a));
/** The same cycle half a period later (the other leg). */
const halfLater = (angles: number[]) => {
  const cycle = angles.slice(0, -1);
  const half = cycle.length / 2;
  const shifted = cycle.map((_, i) => cycle[(i + half) % cycle.length]);
  return [...shifted, shifted[0]];
};

function stride(duration: number, thigh: number, knee: number[], arm: number, elbow: number): Clip {
  const t = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * duration * 1e4) / 1e4);
  const swing = [0, -thigh, 0, thigh, 0];
  const arms = [0, arm, 0, -arm, 0];
  const ends = [0, duration];
  return {
    duration,
    tracks: [
      x("upperleg01.L", t, swing),
      x("upperleg01.R", t, mirror(swing)),
      x("lowerleg01.L", t, knee),
      x("lowerleg01.R", t, halfLater(knee)),
      x("upperarm01.L", t, arms),
      x("upperarm01.R", t, mirror(arms)),
      x("lowerarm01.L", ends, [-elbow, -elbow]),
      x("lowerarm01.R", ends, [-elbow, -elbow]),
    ],
  };
}

const REACH_T = [0, 0.8, 1.6, 2.4, 3.2];
const REACH = [0, -75, -150, -75, 0];
const SIT_T = [0, 1, 2, 3.2, 4.2, 5.2];
const SIT_THIGH = [0, -45, -90, -90, -45, 0];

export const CLIPS: Record<Motion, Clip> = {
  WALK: stride(1.1, 25, [20, 35, 5, 5, 20], 20, 10),
  RUN: stride(0.7, 45, [40, 80, 10, 10, 40], 40, 70),
  REACH: {
    duration: 3.2,
    tracks: [x("upperarm01.L", REACH_T, REACH), x("upperarm01.R", REACH_T, REACH)],
  },
  SIT: {
    duration: 5.2,
    tracks: [
      x("upperleg01.L", SIT_T, SIT_THIGH),
      x("upperleg01.R", SIT_T, SIT_THIGH),
      x("lowerleg01.L", SIT_T, mirror(SIT_THIGH)),
      x("lowerleg01.R", SIT_T, mirror(SIT_THIGH)),
      x("spine05", SIT_T, [0, 3, 5, 5, 3, 0]),
    ],
    drop: { times: SIT_T, values: [0, 0.5, 1, 1, 0.5, 0] },
  },
};

/** Bone angles at time `t` (seconds; wraps round the clip). */
export function poseAt(motion: Motion, t: number): Record<string, Angles> {
  const clip = CLIPS[motion];
  const at = ((t % clip.duration) + clip.duration) % clip.duration;
  const pose: Record<string, Angles> = {};
  for (const track of clip.tracks) {
    let i = track.times.findIndex((time) => time > at);
    if (i < 0) i = track.times.length - 1;
    const a = Math.max(0, i - 1);
    const span = track.times[i] - track.times[a];
    const f = span > 0 ? Math.min(1, Math.max(0, (at - track.times[a]) / span)) : 0;
    pose[track.bone] = track.degrees[a].map(
      (v, c) => v + (track.degrees[i][c] - v) * f,
    ) as Angles;
  }
  return pose;
}

/** The body's own sizes a clip needs: where the hips rest and how long the thigh is, metres. */
export interface RestPose {
  root: [number, number, number];
  thigh: number;
}

/** A three.js clip for a loaded body. Track names follow the loader's bone names (no dots). */
export function clipFor(THREE: typeof Three, motion: Motion, rest: RestPose): Three.AnimationClip {
  const clip = CLIPS[motion];
  const euler = new THREE.Euler();
  const q = new THREE.Quaternion();
  const rad = Math.PI / 180;
  const tracks: Three.KeyframeTrack[] = clip.tracks.map((track) => {
    const values: number[] = [];
    for (const [ax, ay, az] of track.degrees) {
      q.setFromEuler(euler.set(ax * rad, ay * rad, az * rad, "XYZ"));
      values.push(q.x, q.y, q.z, q.w);
    }
    return new THREE.QuaternionKeyframeTrack(
      `${THREE.PropertyBinding.sanitizeNodeName(track.bone)}.quaternion`,
      track.times,
      values,
    );
  });
  if (clip.drop)
    tracks.push(
      new THREE.VectorKeyframeTrack(
        "root.position",
        clip.drop.times,
        clip.drop.values.flatMap((d) => [rest.root[0], rest.root[1] - d * rest.thigh, rest.root[2]]),
      ),
    );
  return new THREE.AnimationClip(motion, clip.duration, tracks);
}
