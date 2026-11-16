"""Accuracy report and calibration against tape-measured cases (DEC-021)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import accuracy  # noqa: E402
from outline import View, observe  # noqa: E402


def test_calibrate_refuses_fewer_than_five_cases():
    with pytest.raises(ValueError, match="at least 5"):
        accuracy.calibrate([{}] * 4)


def _box_view(left, right):
    mask = np.zeros((200, 100), dtype=np.uint8)
    mask[10:190, left : right + 1] = 1
    lm = np.zeros((33, 3))
    for i, (x, y) in {11: (40, 50), 12: (60, 50), 23: (45, 110), 24: (55, 110)}.items():
        lm[i] = (x, y, 1.0)
    return View(mask, lm)


def test_clothing_allowance_comes_off_both_sides_of_every_width():
    view = _box_view(30, 69)  # 40 px wide, 180 px tall for 180 cm: 1 cm a pixel
    plain = observe(view, view, 180.0)
    slim = observe(view, view, 180.0, {"clothingCm": 1.5})
    assert plain.width[0] == pytest.approx(40.0)
    assert slim.width == pytest.approx(plain.width - 3.0)
    assert slim.depth == pytest.approx(plain.depth - 3.0)
    assert slim.torso == plain.torso


def test_the_shipped_calibration_changes_nothing_until_cases_are_measured():
    cal = accuracy.load_calibration()
    assert cal["cases"] == 0 and cal["clothingCm"] == 0.0


def test_summary_gives_bias_spread_and_failures():
    rows = [
        {"status": "ok", "error": {"chest": 2.0, "waist": -1.0, "hip": 0.0}},
        {"status": "ok", "error": {"chest": 4.0, "waist": 1.0, "hip": 0.0}},
        {"status": "failed", "error": None},
    ]
    rep = accuracy.summarise(rows)
    assert rep["cases"] == 3 and rep["failed"] == 1
    assert rep["chest"] == {"bias": 3.0, "mae": 3.0, "sd": 1.0}
    assert rep["waist"] == {"bias": 0.0, "mae": 1.0, "sd": 1.0}
    assert rep["pass"] is False  # chest is off by more than 2 cm on average


@pytest.fixture(scope="module")
def fitter():
    pytest.importorskip("anny")
    from fit import Fitter

    return Fitter()


@pytest.mark.anny
def test_calibrate_recovers_a_known_clothing_allowance(fitter):
    from synthetic import widened_case

    phenos = [[0, 0.75, 0.5, 0.4, 0.5, 0.5], [1, 0.75, 0.4, 0.6, 0.5, 0.5], [0, 0.8, 0.6, 0.7, 0.6, 0.5],
              [1, 0.7, 0.5, 0.3, 0.4, 0.5], [0, 0.75, 0.3, 0.5, 0.7, 0.5]]
    cases = [json.loads(json.dumps(widened_case(fitter.body, p, clothing_px=4))) for p in phenos]
    worn = cases[0]["clothingCm"]
    assert 1.0 < worn < 2.0
    before = accuracy.report(cases[:2], {"clothingCm": 0.0}, fitter)
    assert before["chest"]["bias"] > 3.0  # clothes read as a bigger body
    cal = accuracy.calibrate(cases, fitter)
    assert abs(cal["clothingCm"] - worn) <= 0.5
    assert cal["cases"] == 5
    assert abs(cal["report"]["chest"]["bias"]) < 2.0 and abs(cal["report"]["waist"]["bias"]) < 2.0
