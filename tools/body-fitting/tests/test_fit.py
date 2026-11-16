"""Body fitting tests. The fit tests build synthetic phone input from known Anny bodies.

    python -m pytest tools/body-fitting/tests -q          # all, ~2 min, loads Anny
    python -m pytest tools/body-fitting/tests -q -m "not anny"
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from body import LOCAL, _hull_perimeter  # noqa: E402
from outline import View, mask_to_spans  # noqa: E402


def test_hull_perimeter_is_a_tape_around_the_points():
    square = np.array([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]])
    assert _hull_perimeter(square) == pytest.approx(4.0)
    a = np.linspace(0, 2 * np.pi, 400, endpoint=False)
    circle = np.stack([np.cos(a), np.sin(a)], 1) * 0.15
    assert _hull_perimeter(circle) == pytest.approx(2 * np.pi * 0.15, rel=1e-3)


def test_outline_spans_round_trip():
    mask = np.zeros((6, 8), dtype=np.uint8)
    mask[1, 2:5] = 1
    mask[3, 0:2] = 1
    mask[3, 5:8] = 1
    spans = mask_to_spans(mask)
    assert spans == [[1, 2, 4], [3, 0, 1], [3, 5, 7]]
    view = View.from_json({"width": 8, "height": 6, "spans": spans, "landmarks": [[0, 0, 1]] * 33})
    assert (view.mask == mask).all()


def test_outline_rejects_bad_input():
    with pytest.raises(ValueError):
        View.from_json({"width": 8, "height": 6, "spans": [], "landmarks": [[0, 0, 1]] * 10})
    with pytest.raises(ValueError):
        View.from_json({"width": 99999, "height": 6, "spans": [], "landmarks": [[0, 0, 1]] * 33})


# --- fits on synthetic bodies (need the Anny model data, ~1.4 GB, downloaded on first use) ---

BODIES = {
    "man": ([0.1, 0.75, 0.6, 0.7, 0.6, 0.4], {"measure-waist-circ-incr": 0.6, "measure-hips-circ-incr": -0.3}),
    "woman": ([0.95, 0.7, 0.4, 0.35, 0.3, 0.6], {"measure-bust-circ-incr": 0.5, "buttocks-volume-incr": 0.4}),
    "heavy_man": ([0.0, 0.9, 0.3, 0.9, 0.5, 0.5], {"stomach-pregnant-incr": 0.5}),
}


@pytest.fixture(scope="module")
def fitter():
    pytest.importorskip("anny")
    from fit import Fitter

    return Fitter()


def _job(fitter, name, typed=()):
    from synthetic import make_job

    ph, lc = BODIES[name]
    local = np.array([[lc.get(k, 0.0) for k in LOCAL]])
    job, truth = make_job(fitter.body, ph, local, typed)
    job["gender"] = round(ph[0])
    return json.loads(json.dumps(job)), truth  # exactly what would cross the wire


@pytest.mark.anny
@pytest.mark.parametrize("name", list(BODIES))
def test_fit_recovers_body_from_outlines(fitter, name):
    from fit import Job

    job, truth = _job(fitter, name)
    result = fitter.fit(Job.from_json(job))
    m = result["measurements"]
    assert result["status"] == "ok", result["quality"]
    assert result["quality"]["rmsCm"] < 0.6
    assert abs(m["height"] - truth["height"]) < 1.0
    assert abs(m["chest"] - truth["chest"]) < 2.0
    assert abs(m["waist"] - truth["waist"]) < 2.0
    assert abs(m["hip"] - truth["hip"]) < 3.5  # outlines alone: tape measurements tighten this
    assert result["seconds"] < 60


@pytest.mark.anny
def test_typed_measurements_tighten_the_fit(fitter):
    from fit import Job

    job, truth = _job(fitter, "heavy_man", typed=("chest", "waist", "hip"))
    m = fitter.fit(Job.from_json(job))["measurements"]
    for k in ("chest", "waist", "hip"):
        assert abs(m[k] - truth[k]) < 1.0, k


@pytest.mark.anny
def test_outline_no_body_can_match_fails(fitter):
    """A zig-zag outline (every other 10-row stripe 35% wider, like flapping clothes) fits no body."""
    from fit import Job

    job, _ = _job(fitter, "man")
    front = job["front"]
    w = front["width"]

    def widen(y, a, b):
        if (y // 10) % 2:
            return [y, a, b]
        c, half = (a + b) / 2, (b - a) / 2 * 1.35
        return [y, max(0, int(c - half)), min(w - 1, int(c + half))]

    front["spans"] = [widen(*s) for s in front["spans"]]
    result = fitter.fit(Job.from_json(job))
    assert result["status"] == "failed"
    assert "outline_mismatch" in result["quality"]["reasons"]


@pytest.mark.anny
def test_serve_answers_several_requests_on_one_loaded_model(fitter, tmp_path):
    """`fit.py --serve`: one JSON request per line in, one answer per line out, model loaded once."""
    import subprocess

    job, _ = _job(fitter, "man")
    glb = tmp_path / "a.glb"
    params = {"phenotype": {"gender": 0, "age": 0.75, "muscle": 0.5, "weight": 0.5, "height": 0.5,
                            "proportions": 0.5}, "local": {}}
    lines = [
        json.dumps({"id": "a", "job": job, "glb": str(glb)}),
        "this is not json",
        json.dumps({"id": "b", "job": {"heightCm": 50}}),
        json.dumps({"id": "c", "params": params, "glb": str(tmp_path / "c.glb")}),
    ]
    fit_py = Path(__file__).resolve().parents[1] / "fit.py"
    done = subprocess.run([sys.executable, str(fit_py), "--serve"], input="\n".join(lines) + "\n",
                          capture_output=True, text=True, timeout=240)
    out = [json.loads(line) for line in done.stdout.strip().splitlines()]
    assert done.returncode == 0, done.stderr[-500:]
    assert out[0] == {"ready": True}
    assert out[1]["id"] == "a" and out[1]["result"]["status"] == "ok" and glb.stat().st_size > 1000
    assert out[2]["id"] is None and "error" in out[2]
    assert out[3]["id"] == "b" and "height" in out[3]["error"]
    assert out[4] == {"id": "c", "result": {"status": "ok", "bodyVersion": 2}}
    assert (tmp_path / "c.glb").exists()
