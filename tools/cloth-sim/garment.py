"""The garment a cloth simulation starts from (DEC-021, Phase 6). Plain numpy, no Blender.

The garment is the part of the body's surface it covers (the same parts as the browser's
geometric drape, src/lib/fit/drape.ts `COVER`), pushed out along the normals by each area's room
from the size chart. Where the chart is smaller than the body there is no room: the shell sits
just off the skin and `rest_scale` (chart circumference / the shell's own) is below 1. The
simulation shrinks the cloth's rest lengths by it, which is what puts a tight size in tension.

Axes are the body file's: metres, Y up, facing +Z, X to the body's left, feet at y = 0.
"""

from __future__ import annotations

import json
import math
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Same order as src/lib/fit/regions.ts REGION_ID; 255 is neutral (plain garment colour).
REGION_ID = {"chest": 0, "waist": 1, "hip": 2, "upperArm": 3, "thigh": 4, "shoulder": 5, "torso": 6}
NEUTRAL = 255
# Body part per vertex (`_BODY_PART`, tools/body-fitting/body.py PART, drape.ts PART).
PART = {"chest": 0, "waist": 1, "hip": 2, "upperArm": 3, "thigh": 4, "shoulder": 5,
        "lowerArm": 6, "lowerLeg": 7, "head": 8, "end": 9, "seat": 10}
PART_COUNT = 11
COVER = {
    "top": ["chest", "waist", "hip", "upperArm", "shoulder"],
    "outer": ["chest", "waist", "hip", "upperArm", "shoulder", "lowerArm"],
    "bottom": ["waist", "hip", "seat", "thigh", "lowerLeg"],
    "dress": ["chest", "waist", "hip", "seat", "shoulder", "thigh"],
}
# Fit area shown on each part (drape.ts PART_REGION).
PART_REGION = ["chest", "waist", "hip", "upperArm", "thigh", "shoulder", None, None, None, None, "hip"]
TORSO_PARTS = [PART[p] for p in ("chest", "waist", "hip", "shoulder", "seat")]
# Areas measured round the body; the shoulder and torso entries of a chart are lengths.
GIRTHS = ("chest", "waist", "hip", "upperArm", "thigh")
LIMB_AXIS = {"upperArm": ("upperarm01.L", "lowerarm01.L"), "thigh": ("upperleg01.L", "lowerleg01.L")}

# Room between body and shell, cm. The minimum stays above the simulation's collision distances
# (simulate.py), so the cloth never starts inside the collider's reach.
MIN_GAP_CM = 1.0
# The simulated skin is thicker than the real one by the collider's outer thickness plus the
# cloth's collision distance (simulate.py BODY_THICKNESS + CLOTH_DISTANCE). The rest shape is let
# out by the same amount, so a chart equal to the body reads as touching, not stretched.
COLLISION_OFFSET_CM = 0.9
MAX_GAP_CM = 6.0
DEFAULT_GAP_CM = 1.2
# Shrinking past these makes Blender's cloth unstable; a size that tight reads fully tight anyway.
SCALE_RANGE = (0.6, 1.4)
SMOOTHING = 8


@dataclass
class Body:
    positions: np.ndarray  # (n, 3) float64
    faces: np.ndarray  # (m, 3) int64
    parts: np.ndarray  # (n,) int
    joints: np.ndarray  # (n, 4) int
    weights: np.ndarray  # (n, 4) float64
    names: list[str]
    parents: list[int]
    heads: np.ndarray  # (bones, 3), rest-pose bone heads

    def bone(self, name: str) -> np.ndarray:
        return self.heads[self.names.index(name)]


@dataclass
class Garment:
    vertices: np.ndarray  # (n, 3) float64, the shell
    faces: np.ndarray  # (m, 3) int64
    edges: np.ndarray  # (e, 2) int64
    source: np.ndarray  # (n,) body vertex each garment vertex came from
    part: np.ndarray  # (n,) body part
    region: np.ndarray  # (n,) uint8 REGION_ID, NEUTRAL where the part has no fit area
    joints: np.ndarray  # (n, 4) uint8, the body's bones at `source`
    weights: np.ndarray  # (n, 4) float32
    scale: np.ndarray  # (n,) per-vertex rest scale, smoothed across part borders
    rest: np.ndarray  # (n, 3) the garment at its size: the shell taken in or let out round the body
    drape: np.ndarray  # (n, 3) where the cloth sits on the standing body: `rest`, kept MIN_GAP off the skin
    rim: np.ndarray  # (n,) bool, on an opening (neck, hem, cuff): fewer edges, no strain measured
    rest_scale: dict[int, float]  # REGION_ID -> chart / shell circumference (1.0 without a chart)
    body_girth: dict[str, float]  # cm
    shell_girth: dict[str, float]  # cm
    room: dict[str, float]  # chart girth minus the body's, cm (negative: smaller than the body)


def read_body(path: str) -> Body:
    """A skinned body file as tools/body-fitting `write_body` writes it."""
    raw = Path(path).read_bytes()
    n = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + n])
    blob = raw[20 + n + 8:]
    types = {5126: np.float32, 5121: np.uint8, 5123: np.uint16, 5125: np.uint32}
    width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4, "MAT4": 16}

    def acc(i):
        a = doc["accessors"][i]
        v = doc["bufferViews"][a["bufferView"]]
        arr = np.frombuffer(blob, types[a["componentType"]], a["count"] * width[a["type"]],
                            v.get("byteOffset", 0) + a.get("byteOffset", 0))
        return arr.reshape(a["count"], -1) if width[a["type"]] > 1 else arr

    prim = doc["meshes"][0]["primitives"][0]
    at = prim["attributes"]
    if "JOINTS_0" not in at or not doc.get("skins"):
        raise ValueError("the body file has no skeleton (bodyVersion < 2)")
    joints = doc["skins"][0]["joints"]
    parents = [-1] * len(joints)
    for k, j in enumerate(joints):
        for c in doc["nodes"][j].get("children", []):
            parents[joints.index(c)] = k
    offsets = np.array([doc["nodes"][j].get("translation", [0, 0, 0]) for j in joints], float)
    heads = np.zeros_like(offsets)
    for k in range(len(joints)):  # parents come before children
        heads[k] = offsets[k] + (heads[parents[k]] if parents[k] >= 0 else 0)
    return Body(
        positions=acc(at["POSITION"]).astype(np.float64),
        faces=acc(prim["indices"]).astype(np.int64).reshape(-1, 3),
        parts=np.rint(acc(at["_BODY_PART"])).astype(int),
        joints=acc(at["JOINTS_0"]).astype(int),
        weights=acc(at["WEIGHTS_0"]).astype(np.float64),
        names=[doc["nodes"][j]["name"] for j in joints],
        parents=parents,
        heads=heads,
    )


def vertex_normals(p: np.ndarray, faces: np.ndarray) -> np.ndarray:
    fn = np.cross(p[faces[:, 1]] - p[faces[:, 0]], p[faces[:, 2]] - p[faces[:, 0]])
    n = np.zeros_like(p)
    for k in range(3):
        np.add.at(n, faces[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def hull_perimeter(pts: np.ndarray) -> float:
    """Convex hull perimeter of 2D points: a tape round a cross-section."""
    p = np.unique(np.round(pts, 6), axis=0)
    if len(p) < 3:
        return float("nan")
    p = p[np.lexsort((p[:, 1], p[:, 0]))]

    def half(points):
        out: list[np.ndarray] = []
        for q in points:
            while len(out) >= 2:
                a, b = out[-2], out[-1]
                if (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) > 0:
                    break
                out.pop()
            out.append(q)
        return out

    hull = np.array(half(p)[:-1] + half(p[::-1])[:-1])
    return float(np.linalg.norm(np.roll(hull, -1, axis=0) - hull, axis=1).sum())


FULLEST = ("thigh",)  # taped round the fullest part (just below the crotch), not the middle
_SLICE_M = 0.012
_SCAN_STEP_M = 0.005


def girth(points: np.ndarray, parts: np.ndarray, body: Body, region: str) -> float:
    """Tape measure (cm) round `region`: a 2.4 cm slice through the middle of its vertices
    (the thigh: its fullest slice), across the torso, or across the left limb at right angles to
    its bone. tools/fit-simulation/clusters.py lists the standard bodies' limbs with this."""
    if region in LIMB_AXIS:
        a, b = (body.bone(n) for n in LIMB_AXIS[region])
        axis = (b - a) / np.linalg.norm(b - a)
        sel = (parts == PART[region]) & (points[:, 0] > 0)
        pool = sel
    else:
        axis = np.array([0.0, 1.0, 0.0])
        sel = parts == PART[region]
        pool = np.isin(parts, TORSO_PARTS)
    if not sel.any():
        return float("nan")
    along = points @ axis
    u = np.cross(axis, [0, 0, 1.0] if abs(axis[2]) < 0.9 else [1.0, 0, 0])
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)

    def tape(at: float, least: int = 3) -> float:
        band = pool & (np.abs(along - at) < _SLICE_M)
        if band.sum() < least:
            return float("nan")
        q = points[band] - np.outer(along[band], axis)
        return 100 * hull_perimeter(np.stack([q @ u, q @ v], axis=1))

    if region in FULLEST:
        lo, hi = along[sel].min() + _SLICE_M, along[sel].max() - _SLICE_M
        tapes = [tape(t, 8) for t in np.arange(lo, hi, _SCAN_STEP_M)]
        return float(np.nanmax(tapes)) if np.isfinite(tapes).any() else float("nan")
    return tape(float(np.median(along[sel])))


def _smooth(x: np.ndarray, edges: np.ndarray, rounds: int = SMOOTHING) -> np.ndarray:
    count = np.ones(len(x))
    np.add.at(count, edges[:, 0], 1)
    np.add.at(count, edges[:, 1], 1)
    for _ in range(rounds):
        s = x.copy()
        np.add.at(s, edges[:, 0], x[edges[:, 1]])
        np.add.at(s, edges[:, 1], x[edges[:, 0]])
        x = s / count
    return x


def edges_of(faces: np.ndarray) -> np.ndarray:
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    return np.unique(np.sort(e, axis=1), axis=0)


LIMB_BONES = {PART["upperArm"]: ("upperarm01", "lowerarm01"), PART["lowerArm"]: ("lowerarm01", "wrist"),
              PART["thigh"]: ("upperleg01", "lowerleg01"), PART["lowerLeg"]: ("lowerleg01", "foot")}


def _rest_shape(shell: np.ndarray, part: np.ndarray, scale: np.ndarray, body: Body) -> np.ndarray:
    """Each vertex moved towards its axis by `scale`, round the body only (lengths keep): the
    torso round the vertical line through its middle at that height, sleeves and legs round
    their bone. The simulation's springs take their rest lengths from this shape."""
    rest = shell.copy()
    torso = np.isin(part, TORSO_PARTS)
    if torso.any():
        band = np.floor(shell[:, 1] / 0.02).astype(int)
        keys = np.unique(band[torso])
        centre = {b: shell[torso & (band == b)][:, [0, 2]].mean(axis=0) for b in keys}
        for i in np.flatnonzero(torso):
            c = centre[band[i]] if band[i] in centre else centre[keys[np.abs(keys - band[i]).argmin()]]
            rest[i, [0, 2]] = c + (shell[i, [0, 2]] - c) * scale[i]
    for p_id, (a_name, b_name) in LIMB_BONES.items():
        for side, sel in (("L", shell[:, 0] > 0), ("R", shell[:, 0] <= 0)):
            m = (part == p_id) & sel
            if not m.any():
                continue
            a, b = body.bone(f"{a_name}.{side}"), body.bone(f"{b_name}.{side}")
            u = (b - a) / np.linalg.norm(b - a)
            d = shell[m] - a
            radial = d - np.outer(d @ u, u)
            rest[m] = shell[m] - radial * (1 - scale[m])[:, None]
    return rest


def with_hem(cls: str, chart_row: dict[str, float]) -> dict[str, float]:
    """A top's chart rarely gives a hip: its hem goes round the hip at the chart's waist (a tee or
    shirt is cut straight below the chest), so the hip is held to that instead of hanging free."""
    if cls in ("top", "outer") and "hip" not in chart_row and "waist" in chart_row:
        return {**chart_row, "hip": chart_row["waist"]}
    return chart_row


def build(body_glb: str | Body, cls: str, short: bool, chart_row: dict[str, float]) -> Garment:
    body = body_glb if isinstance(body_glb, Body) else read_body(body_glb)
    if cls not in COVER:
        raise ValueError(f"unknown garment class {cls!r}")
    cover = [PART[p] for p in COVER[cls] if not (short and p == "lowerLeg")]
    keep = np.isin(body.parts[body.faces], cover).all(axis=1)
    tris = body.faces[keep]
    source = np.unique(tris)
    remap = -np.ones(len(body.parts), dtype=np.int64)
    remap[source] = np.arange(len(source))
    faces = remap[tris]
    part = body.parts[source]
    edges = edges_of(faces)
    chart_row = with_hem(cls, chart_row)
    measured = [r for r in GIRTHS if r in chart_row and PART[r] in cover]

    gap_part = np.full(PART_COUNT, DEFAULT_GAP_CM)
    body_girth = {r: girth(body.positions, body.parts, body, r) for r in measured}
    for r in measured:
        room = (chart_row[r] - body_girth[r]) / (2 * math.pi)
        gap_part[PART[r]] = min(MAX_GAP_CM, max(MIN_GAP_CM, room))
    gap_part[PART["seat"]] = gap_part[PART["hip"]]
    gap = _smooth(gap_part[part], edges) / 100
    normals = vertex_normals(body.positions, body.faces)[source]
    shell = body.positions[source] + normals * gap[:, None]

    whole = body.positions.copy()
    whole[source] = shell
    shell_girth = {r: girth(whole, body.parts, body, r) for r in measured}
    scale_part = np.ones(PART_COUNT)
    for r in measured:
        scale_part[PART[r]] = float(np.clip(chart_row[r] / shell_girth[r], *SCALE_RANGE))
    # The seat goes round with the hip; the shoulder yoke keeps its size (the chart's shoulder is
    # a length), so the garment still hangs from the shoulders.
    scale_part[PART["seat"]] = scale_part[PART["hip"]]
    scale = _smooth(scale_part[part], edges)
    rest = _rest_shape(shell, part, scale, body) + normals * (COLLISION_OFFSET_CM / 100)
    # Where the size is smaller than the body the cloth cannot take its rest shape: it lies on the
    # skin. Where it is larger (or the smoothing left the shell wider than the chart) it hangs at
    # its own size. The simulation pulls the cloth lightly towards this, never towards the shell.
    skin = body.positions[source]
    off = ((rest - skin) * normals).sum(axis=1)
    drape = rest + normals * np.maximum(0.0, MIN_GAP_CM / 100 - off)[:, None]
    rim = np.zeros(len(source), bool)
    sorted_e = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    uniq, count = np.unique(sorted_e, axis=0, return_counts=True)
    rim[uniq[count == 1].ravel()] = True

    region = np.array([REGION_ID[PART_REGION[p]] if PART_REGION[p] else NEUTRAL for p in part],
                      dtype=np.uint8)
    rest_scale = {REGION_ID[r]: 1.0 for r in REGION_ID}
    rest_scale[NEUTRAL] = 1.0
    for r in ("chest", "waist", "hip", "upperArm", "thigh", "shoulder"):
        if PART[r] in cover:
            rest_scale[REGION_ID[r]] = float(scale_part[PART[r]])
    return Garment(
        vertices=shell,
        faces=faces,
        edges=edges,
        source=source,
        part=part,
        region=region,
        joints=body.joints[source].astype(np.uint8),
        weights=body.weights[source].astype(np.float32),
        scale=scale,
        rest=rest,
        drape=drape,
        rim=rim,
        rest_scale=rest_scale,
        body_girth=body_girth,
        shell_girth=shell_girth,
        room={r: float(chart_row[r] - body_girth[r]) for r in measured},
    )
