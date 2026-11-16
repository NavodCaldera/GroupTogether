"""How close fitted bodies come to a tape measure, and the correction that removes the bias.

    python accuracy.py cases/                # report as JSON
    python accuracy.py cases/ --calibrate    # also rewrite calibration.json

A case is `{"job": <what the phone sent>, "tape": {"chest": cm, "waist": cm, "hip": cm}}`, one
JSON file per volunteer, written by `scripts/export-body-case.ts`. Cases are personal data and
stay out of git (`cases/.gitignore`).

The one correction is `clothingCm`: what clothing adds to each side of the outline. An outline
that is c cm wider all round has a girth about 2*pi*c longer, so the mean girth error gives c.
The release gate (`DEC-021`): mean absolute error at most 2 cm for each of chest, waist and hip,
and at most 2 failed builds in 10.
"""

from __future__ import annotations

import contextlib
import json
import math
import sys
from pathlib import Path

import numpy as np

MEASURES = ("chest", "waist", "hip")
CALIBRATION = Path(__file__).with_name("calibration.json")
MIN_CASES = 5
MAX_CLOTHING_CM = 3.0
GATE_MAE_CM = 2.0
GATE_FAILED = 0.2


def load_calibration() -> dict:
    return json.loads(CALIBRATION.read_text("utf-8"))


def summarise(rows: list[dict]) -> dict:
    """`rows`: per case `{"status", "error": {measure: fitted - tape} | None}`."""
    ok = [r["error"] for r in rows if r["status"] == "ok" and r["error"]]
    out: dict = {"cases": len(rows), "failed": len(rows) - len(ok)}
    for k in MEASURES:
        e = np.array([r[k] for r in ok], dtype=float)
        out[k] = ({"bias": round(float(e.mean()), 2), "mae": round(float(np.abs(e).mean()), 2),
                   "sd": round(float(e.std()), 2)} if len(e) else None)
    out["pass"] = bool(ok) and out["failed"] <= GATE_FAILED * len(rows) and all(
        out[k]["mae"] <= GATE_MAE_CM for k in MEASURES)
    return out


def report(cases: list[dict], cal: dict, fitter=None) -> dict:
    """Fits every case with calibration `cal` and compares chest, waist and hip with the tape."""
    from fit import Fitter, Job

    fitter = fitter or Fitter()
    rows = []
    for case in cases:
        job = {k: v for k, v in case["job"].items() if k != "typed"}  # the tape is the answer
        try:
            result = fitter.fit(Job.from_json(job, cal))
        except ValueError:
            rows.append({"status": "failed", "error": None})
            continue
        m = result["measurements"]
        rows.append({"status": result["status"],
                     "error": {k: m[k] - float(case["tape"][k]) for k in MEASURES}})
    return summarise(rows)


def calibrate(cases: list[dict], fitter=None) -> dict:
    """The clothing allowance that brings the mean girth error to zero, with its report."""
    if len(cases) < MIN_CASES:
        raise ValueError(f"need at least {MIN_CASES} cases, got {len(cases)}")
    clothing = 0.0
    rep = report(cases, {"clothingCm": clothing}, fitter)
    for _ in range(2):
        if any(rep[k] is None for k in MEASURES):
            break
        bias = float(np.mean([rep[k]["bias"] for k in MEASURES]))
        step = round(bias / (2 * math.pi) * 4) / 4
        new = min(MAX_CLOTHING_CM, max(0.0, clothing + step))
        if new == clothing:
            break
        clothing = new
        rep = report(cases, {"clothingCm": clothing}, fitter)
    return {"clothingCm": clothing, "cases": len(cases), "report": rep}


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if a != "--calibrate"]
    if len(args) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    cases = [json.loads(p.read_text("utf-8")) for p in sorted(Path(args[0]).glob("*.json"))]
    with contextlib.redirect_stdout(sys.stderr):  # Anny's Warp banner
        if "--calibrate" in argv:
            cal = calibrate(cases)
            rep = cal.pop("report")
            CALIBRATION.write_text(json.dumps(cal, indent=2) + "\n", "utf-8")
        else:
            cal = load_calibration()
            rep = report(cases, cal)
    print(json.dumps({"calibration": cal, "report": rep}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
