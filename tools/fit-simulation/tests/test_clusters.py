"""Body clusters as archetypes (plan Task 6.3)."""

from __future__ import annotations

import itertools
import json
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "body-fitting"))

import clusters  # noqa: E402

FEATURES = ("height", "chest", "waist", "hip")


def well_apart(archetypes: list[dict]) -> bool:
    """No two centres of one gender within 2 cm of each other in every feature."""
    for a, b in itertools.combinations(archetypes, 2):
        if a["gender"] == b["gender"] and all(
            abs(a["params"][k] - b["params"][k]) < 2 for k in FEATURES
        ):
            return False
    return True


def test_kmeans_is_deterministic_and_finds_separate_groups():
    rng = np.random.default_rng(0)
    pts = np.concatenate([rng.normal(c, 0.1, (50, 2)) for c in ((0, 0), (5, 5), (0, 5))])
    a = clusters.kmeans(pts, 3, seed=1)
    b = clusters.kmeans(pts, 3, seed=1)
    assert np.array_equal(a[0], b[0]) and np.array_equal(a[1], b[1])
    centres = sorted(map(tuple, np.round(a[0])))
    assert centres == [(0, 0), (0, 5), (5, 5)]
    assert sorted(np.bincount(a[1])) == [50, 50, 50]


def test_the_committed_clusters_are_twenty_well_apart_archetypes():
    data = json.loads((HERE / "seed" / "clusters.json").read_text("utf-8"))
    assert [a["name"] for a in data] == [f"men-{i:02d}" for i in range(1, 11)] + [
        f"women-{i:02d}" for i in range(1, 11)
    ]
    assert {a["gender"] for a in data[:10]} == {"MEN"} and {a["gender"] for a in data[10:]} == {"WOMEN"}
    assert well_apart(data)
    for a in data:
        mean, sd = clusters.HEIGHT_CM[a["gender"]]
        assert abs(a["params"]["height"] - mean) <= clusters.HEIGHT_TRUNCATE_SD * sd
        assert set(a["anny"]) == {"phenotype", "local"}
        for k in ("height", "chest", "waist", "hip", "torso", "thigh", "upperArm", "shoulder",
                  "neck", "wrist", "inseam"):
            assert a["params"][k] > 0
    import archetypes

    assert archetypes.load(None) == data


@pytest.fixture(scope="module")
def body():
    pytest.importorskip("anny")
    from body import AnnyBody

    return AnnyBody()


@pytest.mark.anny
def test_build_is_repeatable_with_ten_well_apart_clusters_per_gender(body):
    first = clusters.build(per_gender=10, samples=600, seed=1, body=body)
    assert clusters.build(per_gender=10, samples=600, seed=1, body=body) == first
    assert len(first) == 20
    assert sum(a["gender"] == "MEN" for a in first) == 10
    assert sum(a["gender"] == "WOMEN" for a in first) == 10
    assert len({a["name"] for a in first}) == 20
    assert well_apart(first)
    women = [a for a in first if a["gender"] == "WOMEN"]
    assert all(a["anny"]["phenotype"]["gender"] == 1.0 for a in women)
    heights = [a["params"]["height"] for a in women]
    assert heights == sorted(heights)
    # Heights follow the women's adult distribution, not Anny's uniform range.
    assert 148 <= sum(heights) / len(heights) <= 160 and max(heights) <= 154 + 2.5 * 6.5
