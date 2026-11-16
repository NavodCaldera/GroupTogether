"""About 20 body clusters as the standard shapes (archetypes), from sampled Anny bodies.

    python tools/fit-simulation/clusters.py [tools/fit-simulation/seed/clusters.json]

Per gender it samples adult Anny bodies (weight, muscle, height and proportions uniform, age a
young adult's), measures height, chest, waist and hip the way a buyer's body is measured
(tools/body-fitting/body.py), keeps each with a chance that makes the kept heights follow the
gender's adult height distribution (HEIGHT_CM, normal truncated at 2.5 sd: rejection sampling,
taking the measured heights of uniform phenotypes as flat over that range), and groups them with k-means on the standardised measurements.
Each group's archetype is the sampled body nearest its centre, so the stored Anny phenotype
gives exactly the measurements stored with it. Output is deterministic for a seed; names run
men-01 .. men-10 and women-01 .. women-10, shortest first.

Thigh, upper arm, shoulder, neck, wrist and inseam are not measured on the body: they are
estimated from the measured girths and height with the ratios of the earlier hand-made shapes,
for the garment simulation (pipeline.py) only.

Needs the body-fitting environment (Anny); k-means is plain numpy.
"""

from __future__ import annotations

import contextlib
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "body-fitting"))

FEATURES = ("height", "chest", "waist", "hip")
GENDERS = (("MEN", 0.0, "men"), ("WOMEN", 1.0, "women"))
AGE = 0.75  # Anny's young adult (as tools/body-fitting/fit.py PRIOR)
# Adult height (cm) per gender as (mean, sd): approximate South Asian adult figures; owner to
# confirm. Uniform phenotypes reach 136-245 cm, so the kept bodies are drawn toward these.
HEIGHT_CM = {"MEN": (166.0, 7.0), "WOMEN": (154.0, 6.5)}
HEIGHT_TRUNCATE_SD = 2.5
# Estimated measurements: (source, ratio) per gender.
ESTIMATES = {
    "MEN": {"thigh": ("hip", 0.565), "upperArm": ("chest", 0.314), "neck": ("chest", 0.39),
            "wrist": ("height", 0.10), "shoulder": ("height", 0.257), "inseam": ("height", 0.453)},
    "WOMEN": {"thigh": ("hip", 0.566), "upperArm": ("chest", 0.313), "neck": ("chest", 0.365),
              "wrist": ("height", 0.095), "shoulder": ("height", 0.243), "inseam": ("height", 0.451)},
}
OUT = Path(__file__).resolve().parent / "seed" / "clusters.json"


def kmeans(points: np.ndarray, k: int, seed: int = 1, n_init: int = 8, iters: int = 200):
    """k-means (k-means++ starts, Lloyd steps); the best of `n_init` runs. -> (centres, labels)."""
    rng = np.random.default_rng(seed)
    best = None
    for _ in range(n_init):
        centres = points[[rng.integers(len(points))]]
        while len(centres) < k:  # k-means++: far points are likelier starts
            d = ((points[:, None] - centres[None]) ** 2).sum(-1).min(1)
            centres = np.vstack([centres, points[rng.choice(len(points), p=d / d.sum())]])
        labels = None
        for _ in range(iters):
            d = ((points[:, None] - centres[None]) ** 2).sum(-1)
            new = d.argmin(1)
            if labels is not None and np.array_equal(new, labels):
                break
            labels = new
            for j in range(k):
                members = points[labels == j]
                # An empty group restarts on the point farthest from its centre.
                centres[j] = members.mean(0) if len(members) else points[d.min(1).argmax()]
        inertia = float(((points - centres[labels]) ** 2).sum())
        if best is None or inertia < best[0]:
            best = (inertia, centres.copy(), labels.copy())
    return best[1], best[2]


def _sample(body, gender: float, samples: int, rng: np.random.Generator, height: tuple,
            batch: int = 200):
    """`samples` adult bodies, heights drawn to normal(*height) truncated at 2.5 sd: their
    phenotypes and measured features."""
    from body import PHENOTYPES

    xs, ms = [], []
    while len(xs) < samples:
        ph = np.zeros((batch, len(PHENOTYPES)))
        ph[:, 0], ph[:, 1] = gender, AGE
        # Rounded first, so the stored phenotype rebuilds exactly the measured body.
        ph[:, 2:] = np.round(rng.random((batch, 4)), 4)
        keep = rng.random(batch)  # drawn per batch, so the result does not depend on timing
        verts, heads = body.forward(ph)
        for x, v, h, u in zip(ph, verts, heads, keep):
            f = body.features(v, h)
            m = [round(float(getattr(f, k)), 1) for k in FEATURES + ("torso",)]
            if not all(math.isfinite(t) for t in m):
                continue
            z = (m[0] - height[0]) / height[1]
            if abs(z) <= HEIGHT_TRUNCATE_SD and u < math.exp(-0.5 * z * z):
                xs.append(x)
                ms.append(m)
    return np.array(xs[:samples]), np.array(ms[:samples])


def _params(gender: str, m: np.ndarray) -> dict[str, float]:
    p = {k: float(v) for k, v in zip(FEATURES + ("torso",), m)}
    for k, (src, ratio) in ESTIMATES[gender].items():
        p[k] = round(p[src] * ratio, 1)
    return p


def build(per_gender: int = 10, samples: int = 4000, seed: int = 1, body=None) -> list[dict]:
    """One archetype per k-means centre, `per_gender` per gender, men first, shortest first."""
    from body import PHENOTYPES, AnnyBody

    body = body or AnnyBody()
    out = []
    for gi, (gender, g, prefix) in enumerate(GENDERS):
        xs, ms = _sample(body, g, samples, np.random.default_rng([seed, gi]), HEIGHT_CM[gender])
        feats = ms[:, : len(FEATURES)]
        z = (feats - feats.mean(0)) / feats.std(0)
        centres, labels = kmeans(z, per_gender, seed)
        picks = []
        for j, c in enumerate(centres):
            members = np.flatnonzero(labels == j)
            i = members[((z[members] - c) ** 2).sum(1).argmin()]
            picks.append((i, len(members)))
        picks.sort(key=lambda t: (ms[t[0], 0], ms[t[0], 1], t[0]))
        for n, (i, size) in enumerate(picks, 1):
            out.append({
                "name": f"{prefix}-{n:02d}",
                "gender": gender,
                "params": _params(gender, ms[i]),
                "share": round(size / samples, 3),
                "anny": {
                    "phenotype": {k: float(v) for k, v in zip(PHENOTYPES, xs[i])},
                    "local": {},
                },
            })
    return out


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT
    with contextlib.redirect_stdout(sys.stderr):  # Anny's Warp banner
        made = build()
    path.write_text(json.dumps(made, indent=2) + "\n", "utf-8")
    for a in made:
        p = a["params"]
        print(a["name"], *(p[k] for k in FEATURES), a["share"])
