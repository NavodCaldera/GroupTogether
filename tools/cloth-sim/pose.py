"""The app's motion clips on a body file's skeleton, in plain numpy (DEC-021, Phase 6).

A copy of `CLIPS` and `poseAt` in src/lib/fit/motion.ts (tests/test_cloth.py checks the two
agree), and linear blend skinning with the file's translation-only bones, so the simulated body
moves exactly as the browser moves it.
"""

from __future__ import annotations

import math

import numpy as np

ARM_DOWN = 35


def _mirror(a):
    return [0 if v == 0 else -v for v in a]


def _half_later(a):
    cycle = a[:-1]
    half = len(cycle) // 2
    shifted = [cycle[(i + half) % len(cycle)] for i in range(len(cycle))]
    return [*shifted, shifted[0]]


def _x(bone, times, angles):
    return (bone, times, [(v, 0, 0) for v in angles])


def _arm(bone, times, swing, side):
    return (bone, times, [(v, 0, side) for v in swing])


def _stride(duration, thigh, knee, arm, elbow):
    t = [round(f * duration * 1e4) / 1e4 for f in (0, 0.25, 0.5, 0.75, 1)]
    swing = [0, -thigh, 0, thigh, 0]
    arms = [0, arm, 0, -arm, 0]
    ends = [0, duration]
    return {"duration": duration, "tracks": [
        _x("upperleg01.L", t, swing), _x("upperleg01.R", t, _mirror(swing)),
        _x("lowerleg01.L", t, knee), _x("lowerleg01.R", t, _half_later(knee)),
        _arm("upperarm01.L", t, arms, -ARM_DOWN), _arm("upperarm01.R", t, _mirror(arms), ARM_DOWN),
        _x("lowerarm01.L", ends, [-elbow, -elbow]), _x("lowerarm01.R", ends, [-elbow, -elbow]),
    ]}


_REACH_T = [0, 0.8, 1.6, 2.4, 3.2]
_REACH = [0, 62.5, 125, 62.5, 0]
_SIT_T = [0, 1, 2, 3.2, 4.2, 5.2]
_SIT_THIGH = [0, -45, -90, -90, -45, 0]

CLIPS = {
    "WALK": _stride(1.1, 25, [20, 35, 5, 5, 20], 20, 10),
    "RUN": _stride(0.7, 45, [40, 80, 10, 10, 40], 40, 70),
    "REACH": {"duration": 3.2, "tracks": [
        ("upperarm01.L", _REACH_T, [(0, 0, a) for a in _REACH]),
        ("upperarm01.R", _REACH_T, [(0, 0, a) for a in _mirror(_REACH)]),
    ]},
    "SIT": {"duration": 5.2, "tracks": [
        _x("upperleg01.L", _SIT_T, _SIT_THIGH), _x("upperleg01.R", _SIT_T, _SIT_THIGH),
        _x("lowerleg01.L", _SIT_T, _mirror(_SIT_THIGH)),
        _x("lowerleg01.R", _SIT_T, _mirror(_SIT_THIGH)),
        _x("spine05", _SIT_T, [0, 3, 5, 5, 3, 0]),
        _arm("upperarm01.L", [0, 5.2], [0, 0], -ARM_DOWN),
        _arm("upperarm01.R", [0, 5.2], [0, 0], ARM_DOWN),
    ], "drop": (_SIT_T, [0, 0.5, 1, 1, 0.5, 0])},
}
MOTIONS = tuple(CLIPS)


def _lerp(times, values, at):
    i = next((k for k, t in enumerate(times) if t > at), len(times) - 1)
    a = max(0, i - 1)
    span = times[i] - times[a]
    f = min(1.0, max(0.0, (at - times[a]) / span)) if span > 0 else 0.0
    return np.asarray(values[a], float) + (np.asarray(values[i], float) - np.asarray(values[a], float)) * f


def pose_at(motion: str, t: float) -> dict[str, np.ndarray]:
    """Bone angles (degrees, Euler XYZ) at time t, wrapping round the clip, as `poseAt`."""
    clip = CLIPS[motion]
    at = ((t % clip["duration"]) + clip["duration"]) % clip["duration"]
    return {bone: _lerp(times, deg, at) for bone, times, deg in clip["tracks"]}


def drop_at(motion: str, t: float) -> float:
    """How far the hips come down, in thigh lengths (sitting)."""
    clip = CLIPS[motion]
    if "drop" not in clip:
        return 0.0
    at = t % clip["duration"]
    return float(_lerp(*clip["drop"], at))


def euler_xyz(deg) -> np.ndarray:
    """three.js Euler order "XYZ": R = Rx Ry Rz."""
    x, y, z = (math.radians(float(d)) for d in deg)
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rx @ ry @ rz


def skin_matrices(names, parents, heads, angles: dict, drop: float = 0.0) -> np.ndarray:
    """4x4 skinning matrix per bone. `drop` lowers the root by that many thigh lengths."""
    heads = np.asarray(heads, float)
    world = np.zeros((len(names), 4, 4))
    thigh = 0.0
    if drop:
        thigh = float(np.linalg.norm(heads[names.index("upperleg01.L")]
                                     - heads[names.index("lowerleg01.L")]))
    for k, name in enumerate(names):
        local = np.eye(4)
        if name in angles:
            local[:3, :3] = euler_xyz(angles[name])
        local[:3, 3] = heads[k] - (heads[parents[k]] if parents[k] >= 0 else 0)
        if parents[k] < 0:
            local[1, 3] -= drop * thigh
        world[k] = (world[parents[k]] if parents[k] >= 0 else np.eye(4)) @ local
    inverse = np.tile(np.eye(4), (len(names), 1, 1))
    inverse[:, :3, 3] = -heads
    return world @ inverse


def skin(points, joints, weights, matrices) -> np.ndarray:
    h = np.concatenate([points, np.ones((len(points), 1))], axis=1)
    out = np.zeros((len(points), 3))
    for c in range(4):
        out += weights[:, c:c + 1] * np.einsum("nij,nj->ni", matrices[joints[:, c]], h)[:, :3]
    return out
