"""Anny body model wrapper: batched bodies and the features the fit compares.

Anny (github.com/naver/anny) code is Apache 2.0 and its MakeHuman-derived assets are CC0. Only
the plain `anny` package is used. Never call its converters to research-licensed body models:
they download NAVER's non-commercial data (`DEC-021`, `scripts/check-licences.mjs`).

Units: Anny works in metres with Z up; every feature returned here is in centimetres.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch

PHENOTYPES = ("gender", "age", "muscle", "weight", "height", "proportions")

# Fine-stage controls: the ones a front and side outline, height and a tape can see. Each runs
# from -1 to 1 (0 is the phenotype's own shape).
LOCAL = (
    "measure-bust-circ-incr",
    "measure-underbust-circ-incr",
    "measure-waist-circ-incr",
    "measure-hips-circ-incr",
    "measure-shoulder-dist-incr",
    "measure-frontchest-dist-incr",
    "measure-napetowaist-dist-incr",
    "measure-waisttohip-dist-incr",
    "measure-upperleg-height-incr",
    "measure-lowerleg-height-incr",
    "measure-neck-height-incr",
    "torso-scale-depth-incr",
    "torso-scale-horiz-incr",
    "hip-scale-depth-incr",
    "hip-scale-horiz-incr",
    "stomach-pregnant-incr",
    "buttocks-volume-incr",
)

# Outline rows, as fractions of the way from the shoulder joints (0) to the hip joints (1). Same
# frame as the phone's measuring (src/components/fit/capture/calibration.ts).
BANDS = tuple(round(0.2 + 0.05 * i, 2) for i in range(18))  # 0.20 .. 1.05
CHEST_AT = 0.28
WAIST_BAND = (0.45, 0.8)
HIP_BAND = (-0.1, 0.25)  # around the hip line
_GIRTH_STEP = 0.025

_ARM_BONES = ("upperarm", "lowerarm", "wrist", "finger", "metacarpal")

# Body part per vertex, for the garment the app's viewer drapes over the buyer's body. Same codes
# as `PART` in src/lib/fit/drape.ts; the first six match the fit areas' `REGION_ID`.
PART = {
    "chest": 0, "waist": 1, "hip": 2, "upperArm": 3, "thigh": 4, "shoulder": 5,
    "lowerArm": 6, "lowerLeg": 7, "head": 8, "end": 9, "seat": 10,
}
_SKIP_BONES = ("eye.",)


@dataclass
class Features:
    """What the fit compares, in cm. NaN where the outline row does not exist."""

    height: float
    torso: float  # shoulder joints to hip joints
    leg: float  # hip joints to floor
    shoulder_joints: float
    hip_joints: float
    width: np.ndarray  # front outline width at BANDS, arms excluded
    depth: np.ndarray  # side outline depth at BANDS
    chest: float  # girths
    waist: float
    hip: float

    def measurements(self) -> dict[str, float]:
        return {
            "height": round(self.height, 1),
            "chest": round(self.chest, 1),
            "waist": round(self.waist, 1),
            "hip": round(self.hip, 1),
            "torso": round(self.torso, 1),
        }


def _hull_perimeter(pts: np.ndarray) -> float:
    """Convex hull perimeter of 2D points (monotone chain): a tape around a cross-section."""
    if len(pts) < 3:
        return float("nan")
    p = np.unique(np.round(pts, 6), axis=0)
    p = p[np.lexsort((p[:, 1], p[:, 0]))]

    def half(points):
        out: list[np.ndarray] = []
        for q in points:
            while len(out) >= 2:
                a, b = out[-2], out[-1]
                if (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) <= 0:
                    out.pop()
                else:
                    break
            out.append(q)
        return out

    hull = np.array(half(p)[:-1] + half(p[::-1])[:-1])
    return float(np.linalg.norm(np.roll(hull, -1, axis=0) - hull, axis=1).sum())


class AnnyBody:
    """One loaded Anny model (load once per worker: ~1.4 GB data, a few seconds)."""

    def __init__(self) -> None:
        import anny  # imported here so the pure helpers can be tested without the model

        torch.set_num_threads(max(1, min(8, torch.get_num_threads())))
        self.model = anny.Anny(local_changes="default")
        labels = list(self.model.bone_labels)
        missing = [k for k in LOCAL if k not in self.model.local_change_labels]
        if missing:
            raise RuntimeError(f"Anny is missing local controls {missing}")
        self.faces = self.model.faces.numpy()
        idx = self.model.vertex_bone_indices
        dom = idx.gather(1, self.model.vertex_bone_weights.argmax(1, keepdim=True))[:, 0].numpy()
        names = [labels[i] for i in dom]
        self.arm = np.array([any(s in n for s in _ARM_BONES) for n in names])
        skip = np.array([any(s in n for s in _SKIP_BONES) for n in names])
        self.solid = ~skip  # everything that shows in an outline
        self.torso_mask = ~self.arm & ~skip
        edges = np.concatenate([self.faces[:, [0, 1]], self.faces[:, [1, 2]], self.faces[:, [2, 0]]])
        edges = np.unique(np.sort(edges, axis=1), axis=0)
        self.edges = edges[self.torso_mask[edges].all(axis=1)]
        self.bone = {n: labels.index(n) for n in ("upperarm01.L", "upperarm01.R", "upperleg01.L", "upperleg01.R")}
        self.bone_names = names

    def forward(self, phenotype: np.ndarray, local: np.ndarray | None = None):
        """Rest-pose bodies for a batch. phenotype (B, 6) in [0, 1]; local (B, len(LOCAL)) in [-1, 1].

        Returns vertices (B, N, 3) and bone heads (B, 104, 3), metres, Z up, feet on z = min.
        """
        ph = torch.as_tensor(np.atleast_2d(phenotype), dtype=torch.float64)
        kw = {k: ph[:, i] for i, k in enumerate(PHENOTYPES)}
        lc = None
        if local is not None:
            lt = torch.as_tensor(np.atleast_2d(local), dtype=torch.float64)
            lc = {k: lt[:, i] for i, k in enumerate(LOCAL)}
        with torch.no_grad():
            out = self.model(phenotype_kwargs=kw, local_changes_kwargs=lc)
        return out["rest_vertices"].numpy(), out["rest_bone_heads"].numpy()

    def joints(self, heads: np.ndarray) -> dict[str, np.ndarray]:
        b = self.bone
        return {
            "shoulderL": heads[b["upperarm01.L"]],
            "shoulderR": heads[b["upperarm01.R"]],
            "hipL": heads[b["upperleg01.L"]],
            "hipR": heads[b["upperleg01.R"]],
        }

    def features(self, verts: np.ndarray, heads: np.ndarray) -> Features:
        """Features of one body (verts (N, 3), heads (104, 3)), measured like the photos are."""
        j = self.joints(heads)
        z_floor = verts[self.solid, 2].min()
        z_top = verts[self.solid, 2].max()
        zs = (j["shoulderL"][2] + j["shoulderR"][2]) / 2
        zh = (j["hipL"][2] + j["hipR"][2]) / 2
        xc = (j["hipL"][0] + j["hipR"][0]) / 2
        torso = zs - zh

        girth_t = np.arange(WAIST_BAND[0], 1 + HIP_BAND[1] + 1e-9, _GIRTH_STEP)
        ts = np.concatenate([np.array(BANDS), [CHEST_AT], girth_t])
        zb = zs - ts * torso
        e0, e1 = verts[self.edges[:, 0]], verts[self.edges[:, 1]]
        near = (np.maximum(e0[:, 2], e1[:, 2]) >= zb.min()) & (np.minimum(e0[:, 2], e1[:, 2]) <= zb.max())
        e0, e1 = e0[near], e1[near]
        cross = ((e0[None, :, 2] - zb[:, None]) * (e1[None, :, 2] - zb[:, None])) < 0
        k_idx, e_idx = np.nonzero(cross)  # sorted by row k
        a, b = e0[e_idx], e1[e_idx]
        frac = (zb[k_idx] - a[:, 2]) / (b[:, 2] - a[:, 2])
        points = (a + frac[:, None] * (b - a))[:, :2]
        bounds = np.searchsorted(k_idx, np.arange(len(zb) + 1))

        def section(k: int) -> np.ndarray:
            return points[bounds[k] : bounds[k + 1]]

        def width_depth(p: np.ndarray) -> tuple[float, float]:
            if len(p) < 3 or np.abs(p[:, 0] - xc).min() > 0.01:
                return float("nan"), float("nan")  # legs apart: no run through the middle
            return float(np.ptp(p[:, 0])), float(np.ptp(p[:, 1]))

        nb = len(BANDS)
        wd = np.array([width_depth(section(k)) for k in range(nb)])
        chest = _hull_perimeter(section(nb))
        girth = [(t, section(nb + 1 + i)) for i, t in enumerate(girth_t)]
        waist_rows = [p for t, p in girth if t <= WAIST_BAND[1] + 1e-9 and len(p) >= 3]
        hip_rows = [p for t, p in girth if t >= 1 + HIP_BAND[0] - 1e-9 and len(p) >= 3]
        waist = min(waist_rows, key=lambda p: np.ptp(p[:, 0]))
        hip = max(hip_rows, key=lambda p: np.ptp(p[:, 0]))
        return Features(
            height=100 * (z_top - z_floor),
            torso=100 * torso,
            leg=100 * (zh - z_floor),
            shoulder_joints=100 * abs(j["shoulderL"][0] - j["shoulderR"][0]),
            hip_joints=100 * abs(j["hipL"][0] - j["hipR"][0]),
            width=100 * wd[:, 0],
            depth=100 * wd[:, 1],
            chest=100 * chest,
            waist=100 * _hull_perimeter(waist),
            hip=100 * _hull_perimeter(hip),
        )


def _hip(t: float) -> int:
    """Hip down to the hip joints, then the seat (tops end there), then the thigh."""
    return PART["hip"] if t < 1.0 else PART["seat"] if t < 1.2 else PART["thigh"]


def body_parts(body: AnnyBody, verts: np.ndarray, heads: np.ndarray) -> np.ndarray:
    """PART code per vertex: by the bone that moves it, torso split by height between the joints."""
    j = body.joints(heads)
    zs = (j["shoulderL"][2] + j["shoulderR"][2]) / 2
    zh = (j["hipL"][2] + j["hipR"][2]) / 2
    t = (zs - verts[:, 2]) / (zs - zh)  # 0 at the shoulder joints, 1 at the hip joints
    out = np.empty(len(verts), dtype=np.int8)
    for i, n in enumerate(body.bone_names):
        if any(s in n for s in ("head", "neck", "eye")):
            out[i] = PART["head"]
        elif any(s in n for s in ("finger", "metacarpal", "wrist", "toe", "foot")):
            out[i] = PART["end"]
        elif "lowerarm" in n:
            out[i] = PART["lowerArm"]
        elif "upperarm" in n:
            out[i] = PART["upperArm"]
        elif "lowerleg" in n:
            out[i] = PART["lowerLeg"]
        elif "upperleg" in n:
            out[i] = _hip(t[i])
        elif t[i] < 0.12:
            out[i] = PART["shoulder"]
        elif t[i] < 0.5:
            out[i] = PART["chest"]
        elif t[i] < 0.85:
            out[i] = PART["waist"]
        else:
            out[i] = _hip(t[i])
    return out
