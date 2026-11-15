"""Measurement-driven archetype body and garment meshes with four motions (DEC-020).

Seed geometry: elliptical rings sized from the archetype's measurements (body) and the size
chart (garment), arms slightly abducted. Every garment vertex carries the area id the heatmap
uses (src/lib/fit/regions.ts REGION_ID); the collar is neutral (255). Motions are morph
targets animated by weight. The production path replaces the garment with the Blender cloth
result (blender_sim.py) and keeps the same area ids and file layout.
"""

from __future__ import annotations

import math

import numpy as np

from gltf import Mesh

CHEST, WAIST, HIP, UPPER_ARM, THIGH, SHOULDER, TORSO, NEUTRAL = 0, 1, 2, 3, 4, 5, 6, 255
DEPTH = 0.72  # ellipse depth / width
ARM_ANGLE = math.radians(25)  # abduction from vertical
AROUND = 32


def _perimeter(a: float, b: float) -> float:
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


def half_width(circ_cm: float) -> float:
    """Ellipse half-width in metres for a circumference in cm."""
    return circ_cm / 100 / _perimeter(1, DEPTH)


def _tube(rows: list[tuple[np.ndarray, np.ndarray, np.ndarray, float]], around: int):
    """Rings of (centre, x axis, z axis, half width) → positions and triangle indices."""
    pos = []
    for centre, ax, az, r in rows:
        for k in range(around):
            t = 2 * math.pi * k / around
            pos.append(centre + ax * r * math.cos(t) + az * r * DEPTH * math.sin(t))
    idx = []
    for i in range(len(rows) - 1):
        for k in range(around):
            a, b = i * around + k, i * around + (k + 1) % around
            c, d = a + around, b + around
            idx += [a, c, b, b, c, d]
    return np.array(pos, np.float32), np.array(idx, np.uint32)


def _lerp_profile(points: list[tuple[float, float]], y: float) -> float:
    ys, vs = zip(*points)
    return float(np.interp(y, ys, vs))


class Skeleton:
    def __init__(self, p: dict):
        self.h = p["height"] / 100
        self.y_shoulder = 0.815 * self.h
        self.y_hip = self.y_shoulder - p["torso"] / 100
        self.y_crotch = p["inseam"] / 100
        self.half_shoulder = p["shoulder"] / 200
        self.arm_len = 0.33 * self.h

    def arm_axis(self, side: int) -> np.ndarray:
        return np.array([side * math.sin(ARM_ANGLE), -math.cos(ARM_ANGLE), 0], np.float32)

    def shoulder_pivot(self, side: int) -> np.ndarray:
        return np.array([side * (self.half_shoulder - 0.03), self.y_shoulder - 0.04, 0], np.float32)


def _limb(start: np.ndarray, axis: np.ndarray, length: float, r0: float, r1: float,
          rows: int, around: int):
    side_x = np.cross(axis, [0, 0, 1]).astype(np.float32)
    side_x /= np.linalg.norm(side_x)
    z = np.array([0, 0, 1], np.float32)
    ring = [(start + axis * length * i / (rows - 1), side_x, z,
             r0 + (r1 - r0) * i / (rows - 1)) for i in range(rows)]
    return _tube(ring, around)


def _merge(parts):
    pos, idx, off = [], [], 0
    for p, i in parts:
        pos.append(p)
        idx.append(i + off)
        off += len(p)
    return np.concatenate(pos), np.concatenate(idx)


def body_mesh(p: dict) -> tuple[Mesh, dict]:
    s = Skeleton(p)
    profile = [
        (s.y_crotch, p["hip"] * 0.95), (s.y_hip, p["hip"]),
        (s.y_hip + 0.45 * (s.y_shoulder - s.y_hip), p["waist"]),
        (s.y_shoulder - 0.22 * (s.y_shoulder - s.y_hip), p["chest"]),
        (s.y_shoulder, p["chest"] * 0.92), (s.y_shoulder + 0.03, p["neck"] * 1.6),
    ]
    x, z = np.array([1, 0, 0], np.float32), np.array([0, 0, 1], np.float32)
    ys = np.linspace(s.y_crotch, s.y_shoulder + 0.03, 28)
    torso = _tube([(np.array([0, y, 0], np.float32), x, z,
                    half_width(_lerp_profile(profile, y))) for y in ys], AROUND)
    neck = _tube([(np.array([0, y, 0], np.float32), x, z, half_width(p["neck"]))
                  for y in np.linspace(s.y_shoulder + 0.03, s.y_shoulder + 0.1, 3)], 16)
    head = _tube([(np.array([0, s.y_shoulder + 0.1 + 0.22 * t, 0], np.float32), x, z,
                   max(0.005, 0.085 * math.sqrt(math.sin(math.pi * min(0.999, max(0.001, t))))))
                  for t in np.linspace(0.02, 0.98, 10)], 16)
    parts = [torso, neck, head]
    labels = ["torso", "torso", "torso"]
    for side in (-1, 1):
        parts.append(_limb(s.shoulder_pivot(side), s.arm_axis(side), s.arm_len,
                           half_width(p["upperArm"]), half_width(p["wrist"]), 12, 12))
        labels.append(f"arm{side}")
        hip = np.array([side * half_width(p["hip"]) * 0.45, s.y_crotch + 0.02, 0], np.float32)
        parts.append(_limb(hip, np.array([0, -1, 0], np.float32), s.y_crotch,
                           half_width(p["thigh"]), half_width(p["thigh"] * 0.45), 14, 14))
        labels.append(f"leg{side}")
    pos, idx = _merge(parts)
    groups = np.concatenate([[lab] * len(pt[0]) for lab, pt in zip(labels, parts)])
    return Mesh("body", pos, idx, colour=(0.72, 0.68, 0.63, 1)), {"groups": groups, "s": s}


def garment_mesh(p: dict, chart: dict) -> tuple[Mesh, dict]:
    """A tee on the body: rings at the garment's size, never inside the body."""
    s = Skeleton(p)
    length = chart["torso"] / 100
    y_hem = s.y_shoulder - length
    roomy = lambda g, b: max(g, b + 1.0)  # a tight garment is the body surface, stretched
    profile = [
        (y_hem, roomy(chart.get("waist", chart["chest"]), p["hip"])),
        (s.y_hip + 0.45 * (s.y_shoulder - s.y_hip), roomy(chart.get("waist", chart["chest"]), p["waist"])),
        (s.y_shoulder - 0.22 * (s.y_shoulder - s.y_hip), roomy(chart["chest"], p["chest"])),
        (s.y_shoulder, roomy(chart["chest"], p["chest"]) * 0.9),
        (s.y_shoulder + 0.03, p["neck"] * 1.75),
    ]
    x, z = np.array([1, 0, 0], np.float32), np.array([0, 0, 1], np.float32)
    ys = np.linspace(y_hem, s.y_shoulder + 0.03, 34)
    torso_pos, torso_idx = _tube([(np.array([0, y, 0], np.float32), x, z,
                                   half_width(_lerp_profile(profile, y))) for y in ys], AROUND)
    t = (torso_pos[:, 1] - y_hem) / (s.y_shoulder + 0.03 - y_hem)
    regions = np.select(
        [t < 0.18, t < 0.45, t < 0.78, t < 0.97],
        [TORSO, WAIST, CHEST, SHOULDER], NEUTRAL).astype(np.float32)
    parts, region_parts, labels = [(torso_pos, torso_idx)], [regions], ["torso"]
    for side in (-1, 1):
        sleeve = _limb(s.shoulder_pivot(side) - s.arm_axis(side) * 0.02, s.arm_axis(side),
                       0.2, half_width(roomy(chart["upperArm"], p["upperArm"])),
                       half_width(roomy(chart["upperArm"], p["upperArm"])) * 0.95, 8, 16)
        parts.append(sleeve)
        region_parts.append(np.full(len(sleeve[0]), UPPER_ARM, np.float32))
        labels.append(f"arm{side}")
    pos, idx = _merge(parts)
    groups = np.concatenate([[lab] * len(pt[0]) for lab, pt in zip(labels, parts)])
    return (Mesh("garment", pos, idx, region_ids=np.concatenate(region_parts),
                 colour=(0.93, 0.92, 0.9, 1)), {"groups": groups, "s": s, "y_hem": y_hem})


def _rotate(points: np.ndarray, pivot: np.ndarray, axis: str, angle: float) -> np.ndarray:
    c, s_ = math.cos(angle), math.sin(angle)
    q = points - pivot
    if axis == "x":
        r = np.stack([q[:, 0], c * q[:, 1] - s_ * q[:, 2], s_ * q[:, 1] + c * q[:, 2]], 1)
    elif axis == "y":
        r = np.stack([c * q[:, 0] + s_ * q[:, 2], q[:, 1], -s_ * q[:, 0] + c * q[:, 2]], 1)
    else:
        r = np.stack([c * q[:, 0] - s_ * q[:, 1], s_ * q[:, 0] + c * q[:, 1], q[:, 2]], 1)
    return (r + pivot).astype(np.float32)


def _pose(mesh: Mesh, info: dict, arms: tuple[str, float, float], legs: tuple[str, float],
          twist: float = 0, lift: float = 0, bunch: float = 0) -> np.ndarray:
    """Displacement for one pose: arm rotation (axis, left, right), legs, torso changes."""
    s: Skeleton = info["s"]
    g = info["groups"]
    out = mesh.positions.copy()
    for side in (-1, 1):
        sel = g == f"arm{side}"
        angle = arms[1] if side < 0 else arms[2]
        out[sel] = _rotate(out[sel], s.shoulder_pivot(side), arms[0], angle * (side if arms[0] == "z" else 1))
        sel = g == f"leg{side}"
        if sel.any():
            hip = np.array([0, s.y_crotch + 0.02, 0], np.float32)
            out[sel] = _rotate(out[sel], hip, "x", legs[1] * (side if legs[0] == "swing" else -1))
    sel = g == "torso"
    if twist:
        out[sel] = _rotate(out[sel], np.zeros(3, np.float32), "y", twist)
    if lift and "y_hem" in info:
        out[sel, 1] += lift * np.clip(1 - (out[sel, 1] - info["y_hem"]) / 0.5, 0, 1) + lift * 0.3
    if bunch and "y_hem" in info:
        low = np.clip(1 - (mesh.positions[sel, 1] - info["y_hem"]) / 0.25, 0, 1)
        out[sel, 2] += bunch * low
        out[sel, 0] *= 1 + 0.04 * low
    return (out - mesh.positions).astype(np.float32)


R = math.radians
MOTIONS = {
    # targets: list of pose kwargs; keys: (time s, weights per target)
    "WALK": {"targets": [dict(arms=("x", R(20), R(-20)), legs=("swing", R(18)), twist=R(3))],
             "keys": [(0, [0]), (0.275, [1]), (0.55, [0]), (0.825, [-1]), (1.1, [0])]},
    "RUN": {"targets": [dict(arms=("x", R(40), R(-40)), legs=("swing", R(32)), twist=R(6))],
            "keys": [(0, [0]), (0.175, [1]), (0.35, [0]), (0.525, [-1]), (0.7, [0])]},
    "REACH": {"targets": [dict(arms=("z", R(-60), R(-60)), legs=("swing", 0), lift=0.015),
                          dict(arms=("z", R(-125), R(-125)), legs=("swing", 0), lift=0.04)],
              "keys": [(0, [0, 0]), (0.8, [1, 0]), (1.6, [0, 1]), (2.4, [1, 0]), (3.2, [0, 0])]},
    "SIT": {"targets": [dict(arms=("x", R(-10), R(-10)), legs=("bend", R(45)), bunch=0.01),
                        dict(arms=("x", R(-20), R(-20)), legs=("bend", R(90)), bunch=0.025)],
            "keys": [(0, [0, 0]), (1, [1, 0]), (2, [0, 1]), (3.2, [0, 1]), (4.2, [1, 0]),
                     (5.2, [0, 0])]},
}


def animate(meshes: list[tuple[Mesh, dict]], motion: str):
    spec = MOTIONS[motion]
    for mesh, info in meshes:
        mesh.targets = [_pose(mesh, info, **t) for t in spec["targets"]]
    times = np.array([k[0] for k in spec["keys"]], np.float32)
    weights = np.array([k[1] for k in spec["keys"]], np.float32)
    return times, weights
