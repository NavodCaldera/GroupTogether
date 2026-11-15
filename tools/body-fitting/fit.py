"""Fit an Anny body to a buyer's outlines, joints, height and typed measurements (`DEC-021`).

    python fit.py job.json            # prints the result JSON
    python fit.py - < job.json

Job:

    {"heightCm": 172, "gender": 0,              # optional: Anny 0 male .. 1 female
     "typed": {"chest": 96, "waist": 82},       # optional tape measurements, cm
     "front": <outline>, "side": <outline>}     # outline format: see outline.py

CPU only: CMA-ES on the 6 phenotypes, then Levenberg-Marquardt on the phenotypes and the
`LOCAL` controls together. The quality score is the outline error in cm; a fit that misses it is `failed` and the
buyer keeps the archetype body.
"""

from __future__ import annotations

import contextlib
import json
import sys
import time
from dataclasses import dataclass, field

import cma
import numpy as np

from body import LOCAL, PHENOTYPES, AnnyBody, Features
from outline import Observed, View, observe

SD = {
    "height": 0.5,
    "band": 0.8,
    "joint": 2.0,  # MediaPipe joints are not Anny's bone heads: loose until calibrated
    "typed": 1.0,
    "gender": 0.1,
}
MISSING_BAND = 4.0  # squared-error cost when a row exists on only one side
PASS = {"rms_cm": 1.5, "bands": 12, "height_cm": 1.5}
N_PHENO = len(PHENOTYPES)
# Anny's age runs newborn -1/3, baby 0, child 1/3, young adult 2/3, old 1: buyers are adults.
LOWER = np.array([0.0, 0.6, 0.0, 0.0, 0.0, 0.0])
UPPER = np.ones(N_PHENO)
PRIOR = np.array([0.5, 0.75, 0.5, 0.5, 0.5, 0.5])


@dataclass
class Job:
    height: float
    observed: Observed
    typed: dict[str, float] = field(default_factory=dict)
    gender: float | None = None

    @staticmethod
    def from_json(d: dict) -> "Job":
        height = float(d["heightCm"])
        if not 120 <= height <= 220:
            raise ValueError("height out of range")
        front = View.from_json(d["front"])
        side = View.from_json(d["side"]) if d.get("side") else None
        typed = {k: float(v) for k, v in (d.get("typed") or {}).items() if k in ("chest", "waist", "hip")}
        gender = d.get("gender")
        return Job(height, observe(front, side, height), typed, None if gender is None else float(gender))


def _bands(pred: np.ndarray, obs: np.ndarray) -> tuple[np.ndarray, int]:
    """Residuals (cm) where both sides have the row, and how many rows only one side has."""
    both = ~np.isnan(pred) & ~np.isnan(obs)
    one = np.isnan(pred) ^ np.isnan(obs)
    return (pred - obs)[both], int(one.sum())


def residuals(f: Features, job: Job, x: np.ndarray) -> np.ndarray:
    """Weighted residuals; the loss is their sum of squares. Fixed length for a given job."""
    o = job.observed
    r = [(f.height - job.height) / SD["height"]]
    r += [(getattr(f, k) - getattr(o, k)) / SD["joint"] for k in ("torso", "leg", "shoulder_joints", "hip_joints")]
    r += [(getattr(f, k) - v) / SD["typed"] for k, v in job.typed.items()]
    for pred, obs in ((f.width, o.width), (f.depth, o.depth)):
        if np.isnan(obs).all():
            continue
        # A row on only one side costs a fixed amount; rows on neither side cost nothing.
        miss = np.sqrt(MISSING_BAND) * (np.isnan(pred) ^ np.isnan(obs))
        r += list(np.where(np.isnan(pred) | np.isnan(obs), miss, (pred - obs) / SD["band"]))
    ph, lc = x[:N_PHENO], x[N_PHENO:]
    r += list(np.sqrt(0.05) * (ph - PRIOR) / 0.5) + list(np.sqrt(0.3) * lc / 0.6)
    if job.gender is not None:
        r.append((ph[0] - job.gender) / SD["gender"])
    return np.asarray(r, dtype=float)


def loss(f: Features, job: Job, x: np.ndarray) -> float:
    return float(np.sum(np.square(residuals(f, job, x))))


def quality(f: Features, job: Job) -> dict:
    o = job.observed
    res = []
    missing = 0
    for pred, obs in ((f.width, o.width), (f.depth, o.depth)):
        if np.isnan(obs).all():
            continue
        r, m = _bands(pred, obs)
        res.append(r)
        missing += m
    r = np.concatenate(res) if res else np.array([])
    rms = float(np.sqrt(np.mean(np.square(r)))) if len(r) else float("inf")
    height_err = abs(f.height - job.height)
    reasons = []
    if len(r) < PASS["bands"]:
        reasons.append("too_few_rows")
    if rms > PASS["rms_cm"]:
        reasons.append("outline_mismatch")
    if height_err > PASS["height_cm"]:
        reasons.append("height_mismatch")
    return {
        "rmsCm": round(rms, 2),
        "rows": int(len(r)),
        "missingRows": missing,
        "heightErrorCm": round(height_err, 2),
        "pass": not reasons,
        "reasons": reasons,
    }


class Fitter:
    def __init__(self, body: AnnyBody | None = None):
        self.body = body or AnnyBody()
        self.evals = 0

    def _features(self, xs: np.ndarray) -> list[Features]:
        xs = np.atleast_2d(xs)
        local = xs[:, N_PHENO:] if xs.shape[1] > N_PHENO else None
        if local is not None:
            local = np.pad(local, ((0, 0), (0, len(LOCAL) - local.shape[1])))
        verts, heads = self.body.forward(xs[:, :N_PHENO], local)
        self.evals += len(xs)
        return [self.body.features(v, h) for v, h in zip(verts, heads)]

    def _start(self, job: Job) -> np.ndarray:
        """Height phenotype by bisection with the rest at 0.5: a cheap start for CMA."""
        x = PRIOR.copy()
        if job.gender is not None:
            x[0] = job.gender
        lo, hi = 0.0, 1.0
        for _ in range(7):
            x[4] = (lo + hi) / 2
            if self._features(x)[0].height < job.height:
                lo = x[4]
            else:
                hi = x[4]
        return x

    def _cma(self, job: Job, x0, sigma, lower, upper, popsize, iters, seed) -> np.ndarray:
        es = cma.CMAEvolutionStrategy(
            list(x0),
            sigma,
            {"bounds": [list(lower), list(upper)], "popsize": popsize, "seed": seed,
             "maxiter": iters, "verbose": -9, "tolfun": 1e-4},
        )
        while not es.stop():
            xs = np.array(es.ask())
            es.tell(list(xs), [loss(f, job, x) for f, x in zip(self._features(xs), xs)])
        return np.array(es.result.xbest)

    def _refine(self, job: Job, x: np.ndarray, lower, upper, iters: int = 12) -> np.ndarray:
        """Levenberg-Marquardt with a forward-difference Jacobian, one batch per step.

        The outline is close to linear in Anny's local controls, so a few steps beat many
        random samples. Each step evaluates the Jacobian columns and five damping trials together.
        """
        h = 0.01
        r = residuals(self._features(x)[0], job, x)
        for _ in range(iters):
            step = np.where(x + h <= upper, h, -h)
            probes = x + np.diag(step)
            fs = self._features(probes)
            jac = np.stack([(residuals(f, job, p) - r) / s for f, p, s in zip(fs, probes, step)], axis=1)
            jtj, jtr = jac.T @ jac, jac.T @ r
            trials = []
            for lam in (1e-3, 1e-2, 1e-1, 1.0, 10.0):
                a = jtj + lam * (np.diag(np.diag(jtj)) + 1e-6 * np.eye(len(x)))
                trials.append(np.clip(x - np.linalg.solve(a, jtr), lower, upper))
            trials = np.array(trials)
            costs = [float(np.sum(np.square(residuals(f, job, t)))) for f, t in zip(self._features(trials), trials)]
            best = int(np.argmin(costs))
            old = float(np.sum(np.square(r)))
            if costs[best] >= old:
                break
            x = trials[best]
            r = residuals(self._features(x)[0], job, x)
            if old - costs[best] < 1e-3 * old:
                break
        return x

    def fit(self, job: Job, seed: int = 1) -> dict:
        t0 = time.perf_counter()
        self.evals = 0
        x = self._start(job)
        x = self._cma(job, x, 0.15, LOWER, UPPER, 16, 25, seed)
        n = len(LOCAL)
        lower = np.concatenate([LOWER, -np.ones(n)])
        upper = np.concatenate([UPPER, np.ones(n)])
        x = self._refine(job, np.concatenate([x, np.zeros(n)]), lower, upper)
        f = self._features(x)[0]
        q = quality(f, job)
        return {
            "status": "ok" if q["pass"] else "failed",
            "quality": q,
            "phenotype": {k: round(float(v), 4) for k, v in zip(PHENOTYPES, x[:N_PHENO])},
            "local": {k: round(float(v), 4) for k, v in zip(LOCAL, x[N_PHENO:])},
            "measurements": f.measurements(),
            "evals": self.evals,
            "seconds": round(time.perf_counter() - t0, 1),
        }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    src = sys.stdin if argv[1] == "-" else open(argv[1], encoding="utf-8")
    with src:
        job = Job.from_json(json.load(src))
    # Anny's Warp backend prints a banner on stdout: keep stdout for the result alone.
    with contextlib.redirect_stdout(sys.stderr):
        result = Fitter().fit(job)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
