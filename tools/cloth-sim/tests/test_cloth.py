"""Cloth simulation tool (DEC-021, Phase 6).

    python -m pytest tools/cloth-sim/tests -q                 # fast tests
    BLENDER_BIN=... python -m pytest tools/cloth-sim/tests -q  # plus the Blender run (~2 min)

Tests marked `blender` skip when BLENDER_BIN is unset; `anny` ones need the Anny model data.
"""

from __future__ import annotations

import json
import os
import re
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import fabric  # noqa: E402
import garment  # noqa: E402
import pose  # noqa: E402
import run  # noqa: E402
from garment import REGION_ID  # noqa: E402

needs_blender = pytest.mark.skipif(not os.environ.get("BLENDER_BIN"), reason="BLENDER_BIN is unset")


@pytest.fixture(scope="session")
def body_glb():
    """A committed standard body with a skeleton: men-broad-174 (chest 104)."""
    bodies = ROOT / "public" / "fit-assets" / "bodies"
    name = json.loads((bodies / "bodies.json").read_text("utf-8"))["men-broad-174"]
    return str(bodies / name)


def chest(c: float) -> dict[str, float]:
    return {"chest": c, "waist": c - 4, "upperArm": c / 3}


def job(body: str, sizes: dict, motions=("WALK", "REACH")) -> dict:
    return {"body": body, "cls": "top", "short": False, "sizes": sizes,
            "fabric": {"gsm": 180, "stretch_pct": 5, "weave": "Cotton jersey"},
            "motions": list(motions)}


def read_glb(path):
    raw = Path(path).read_bytes()
    n = struct.unpack_from("<I", raw, 12)[0]
    return json.loads(raw[20:20 + n])


# ---- garment -------------------------------------------------------------------------------
def test_rest_scale_is_below_one_for_a_size_smaller_than_the_body(body_glb):
    g = garment.build(body_glb, "top", False, {"chest": 80, "waist": 70, "hip": 85})
    assert g.rest_scale[REGION_ID["chest"]] < 1.0


def test_a_loose_size_is_pushed_out_and_not_shrunk(body_glb):
    g = garment.build(body_glb, "top", False, {"chest": 116})
    assert g.body_girth["chest"] < g.shell_girth["chest"] <= 117
    assert 0.98 < g.rest_scale[REGION_ID["chest"]] < 1.05


def test_a_top_covers_the_torso_and_upper_arms_with_the_body_skin(body_glb):
    body = garment.read_body(body_glb)
    g = garment.build(body, "top", False, chest(100))
    assert set(np.unique(g.region)) == {0, 1, 2, 3, 5}
    assert len(g.vertices) == len(g.joints) == len(g.weights) == len(g.region)
    assert np.array_equal(g.joints, body.joints[g.source])
    assert np.allclose(g.weights.sum(axis=1), 1, atol=1e-4)
    assert g.faces.max() < len(g.vertices)


def test_shorts_leave_the_lower_leg_out(body_glb):
    full = garment.build(body_glb, "bottom", False, {"waist": 90, "hip": 100})
    short = garment.build(body_glb, "bottom", True, {"waist": 90, "hip": 100})
    assert garment.PART["lowerLeg"] in full.part and garment.PART["lowerLeg"] not in short.part


# ---- fabric --------------------------------------------------------------------------------
def test_fabric_gets_softer_with_stretch():
    assert fabric.params(160, 20, "knit")["tension_stiffness"] < fabric.params(160, 0, "woven")["tension_stiffness"]


def test_fabric_defaults_and_bending():
    p = fabric.params(None, None, None)
    assert p["mass"] == pytest.approx(0.16) and p["tension_stiffness"] == pytest.approx(10)
    assert fabric.params(200, 0, "Oxford woven")["bending_stiffness"] == 5
    assert fabric.params(200, 0, "Cotton jersey")["bending_stiffness"] == 0.5


# ---- motion: the same clips as the browser ---------------------------------------------------
def test_clips_match_motion_ts():
    ts = (ROOT / "src" / "lib" / "fit" / "motion.ts").read_text("utf-8")
    assert re.search(r"WALK: stride\(1\.1, 25, \[20, 35, 5, 5, 20\], 20, 10\)", ts)
    assert re.search(r"RUN: stride\(0\.7, 45, \[40, 80, 10, 10, 40\], 40, 70\)", ts)
    assert "const REACH = [0, 62.5, 125, 62.5, 0];" in ts and "const ARM_DOWN = 35;" in ts
    assert "const SIT_THIGH = [0, -45, -90, -90, -45, 0];" in ts
    assert pose.pose_at("WALK", 0.275)["upperleg01.L"][0] == pytest.approx(-25)
    assert pose.pose_at("WALK", 0.275)["upperleg01.R"][0] == pytest.approx(25)
    assert pose.pose_at("REACH", 1.6)["upperarm01.R"][2] == pytest.approx(-125)
    assert pose.pose_at("SIT", 3.0)["upperleg01.L"][0] == pytest.approx(-90)


def test_raising_the_arm_moves_the_hand_up(body_glb):
    body = garment.read_body(body_glb)
    hand = np.array([body.parts == garment.PART["end"]]).squeeze() & (body.positions[:, 0] > 0.3)
    m = pose.skin_matrices(body.names, body.parents, body.heads, pose.pose_at("REACH", 1.6))
    moved = pose.skin(body.positions, body.joints, body.weights, m)
    assert moved[hand, 1].mean() > body.positions[hand, 1].mean() + 0.3
    rest = pose.skin(body.positions, body.joints, body.weights,
                     pose.skin_matrices(body.names, body.parents, body.heads, {}))
    assert np.allclose(rest, body.positions, atol=1e-5)


def test_timeline_eases_into_and_out_of_each_motion():
    frames = run.timeline(["WALK", "REACH", "SIT"])
    assert frames[0] == ({}, 0.0) and len(frames) == run.SETTLE + 3 * (run.MOTION_FRAMES + 2 * run.BLEND)
    bones = {b for a, _ in frames for b in a}

    def angle(f, b):
        return np.asarray(frames[f][0].get(b, (0, 0, 0)), float)

    jumps = [np.abs(angle(f + 1, b) - angle(f, b)).max() for f in range(len(frames) - 1) for b in bones]
    assert max(jumps) < 15  # degrees per frame (0.04 s): no snap from the rest pose
    assert np.abs(angle(len(frames) - 1, "upperleg01.L")).max() < 12


# ---- tension from strain -------------------------------------------------------------------
def test_tension_is_the_95th_percentile_over_the_stretch_capacity():
    region = np.array([0, 0, 0, 3])
    strain = np.zeros((10, 4))
    strain[:, :3] = np.linspace(0, 0.2, 30).reshape(10, 3)
    t = run.tension(strain, region, stretch_pct=5)
    assert t["chest"] == pytest.approx(min(1, np.percentile(strain[:, :3], 95) / 0.10))
    assert t["upperArm"] == 0.0
    assert "waist" not in t


def test_unstable_size_reads_fully_tight():
    out = run.unstable(np.array([0, 1, 3, 255]))
    assert out == {"tension": {"chest": 1.0, "waist": 1.0, "upperArm": 1.0}, "garment": None,
                   "note": "unstable"}


def test_missing_body_fails_without_starting_blender(tmp_path):
    r = run.simulate(job(str(tmp_path / "none.glb"), {"M": chest(100)}), str(tmp_path))
    assert r["status"] == "failed" and r["sizes"] == {}


# ---- Blender -------------------------------------------------------------------------------
@pytest.mark.blender
@needs_blender
def test_smaller_sizes_are_tighter_and_tiny_sizes_do_not_hang(body_glb, tmp_path):
    r = run.simulate(job(body_glb, sizes={"XS": chest(76), "M": chest(100), "XXL": chest(124)}),
                     str(tmp_path), timeout_s=600)
    t = {s: r["sizes"][s]["tension"]["chest"] for s in r["sizes"]}
    assert r["status"] == "ok" and t["XS"] >= t["M"] >= t["XXL"] and t["XS"] > 0.8
    doc = read_glb(tmp_path / r["sizes"]["M"]["garment"])
    attrs = doc["meshes"][0]["primitives"][0]["attributes"]
    assert {"_REGION_ID", "JOINTS_0", "WEIGHTS_0"} <= set(attrs)
    assert [doc["nodes"][j]["name"] for j in doc["skins"][0]["joints"]] == list(pose_bones())


@pytest.mark.blender
@needs_blender
def test_cli_reads_the_job_on_stdin_and_prints_the_result_last(body_glb, tmp_path):
    payload = dict(job(body_glb, {"L": chest(108)}, motions=["WALK"]), out_dir=str(tmp_path))
    p = subprocess.run([sys.executable, str(HERE / "run.py")], input=json.dumps(payload),
                       capture_output=True, text=True, timeout=600)
    assert p.returncode == 0, p.stderr
    result = json.loads(p.stdout.strip().splitlines()[-1])
    assert result["status"] == "ok" and (tmp_path / result["sizes"]["L"]["garment"]).exists()


def pose_bones():
    sys.path.insert(0, str(ROOT / "tools" / "body-fitting"))
    from skin import BONES

    return BONES


@pytest.mark.anny
def test_a_fitted_body_from_measurements_dresses(tmp_path):
    sys.path.insert(0, str(ROOT / "tools" / "body-fitting"))
    from fit import Fitter, write_body

    f = Fitter()
    path = tmp_path / "dilan.glb"
    write_body(f, f.fit_measurements(172, 0, {"chest": 100, "waist": 88, "hip": 98}), str(path))
    g = garment.build(str(path), "top", False, {"chest": 102, "waist": 98})
    assert abs(g.body_girth["chest"] - 100) < 3
