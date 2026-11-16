"""Skeleton in the body file (motions on the buyer's own body, DEC-021)."""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "fit-simulation"))

from gltf import Mesh, Skin, write_glb  # noqa: E402


def read_glb(path):
    raw = Path(path).read_bytes()
    n = struct.unpack_from("<I", raw, 12)[0]
    return json.loads(raw[20 : 20 + n])


def test_glb_with_a_skin_has_joints_and_inverse_binds(tmp_path):
    skin = Skin(
        names=["root", "spine01"],
        parents=[-1, 0],
        heads=np.array([[0, 1, 0], [0, 1.2, 0]], dtype=np.float32),
        joints=np.array([[0, 1, 0, 0]] * 3, dtype=np.uint8),
        weights=np.array([[0.5, 0.5, 0, 0]] * 3, dtype=np.float32),
    )
    tri = Mesh("body", np.eye(3, dtype=np.float32), np.arange(3, dtype=np.uint32), skin=skin)
    path = tmp_path / "s.glb"
    write_glb(str(path), [tri], np.zeros(0), np.zeros((0, 0)), "rest", extras={"bodyVersion": 2})
    doc = read_glb(path)
    prim = doc["meshes"][0]["primitives"][0]
    assert doc["skins"][0]["joints"] == [1, 2]
    assert "JOINTS_0" in prim["attributes"] and "WEIGHTS_0" in prim["attributes"]
    assert doc["nodes"][0]["skin"] == 0
    assert doc["nodes"][1] == {"name": "root", "translation": [0.0, 1.0, 0.0], "children": [2]}
    assert doc["nodes"][2]["translation"] == pytest.approx([0.0, 0.2, 0.0])
    assert doc["scenes"][0]["nodes"] == [0, 1]
    assert doc["asset"]["extras"] == {"bodyVersion": 2}
    assert doc["accessors"][doc["skins"][0]["inverseBindMatrices"]]["type"] == "MAT4"


def test_glb_without_a_skin_is_unchanged(tmp_path):
    tri = Mesh("body", np.eye(3, dtype=np.float32), np.arange(3, dtype=np.uint32))
    path = tmp_path / "p.glb"
    write_glb(str(path), [tri], np.zeros(0), np.zeros((0, 0)), "rest")
    doc = read_glb(path)
    assert "skins" not in doc and doc["nodes"] == [{"name": "body", "mesh": 0}]


@pytest.fixture(scope="module")
def body():
    pytest.importorskip("anny")
    from body import AnnyBody

    return AnnyBody()


@pytest.mark.anny
def test_skin_weights_are_normalised_and_cover_every_vertex(body):
    import skin

    verts, heads = body.forward(np.full((1, 6), 0.5))
    s = skin.skin_for(body, heads[0])
    assert len(s.names) == 36 and s.names == list(skin.BONES) and s.parents[0] == -1
    assert all(p < i for i, p in enumerate(s.parents))
    assert s.joints.shape == (len(verts[0]), 4) and s.weights.shape == (len(verts[0]), 4)
    assert np.allclose(s.weights.sum(axis=1), 1.0, atol=1e-5)
    assert s.joints.max() < 36
    # A fingertip follows the wrist; the top of the head follows the head.
    top = int(verts[0][:, 2].argmax())
    assert s.names[s.joints[top, 0]] == "head"


@pytest.mark.anny
def test_body_file_carries_the_skin_and_version(body, tmp_path):
    from fit import N_PHENO, Fitter, write_body
    from body import LOCAL, PHENOTYPES

    fitter = Fitter(body)
    result = {"phenotype": dict(zip(PHENOTYPES, [0.0, 0.75, 0.5, 0.5, 0.5, 0.5])),
              "local": dict.fromkeys(LOCAL, 0.0)}
    path = tmp_path / "b.glb"
    write_body(fitter, result, str(path))
    doc = read_glb(path)
    assert len(doc["skins"][0]["joints"]) == 36 and doc["asset"]["extras"]["bodyVersion"] == 2
    assert N_PHENO == 6


def test_the_browser_names_the_same_bones_in_the_same_order():
    import re

    import skin

    ts = (Path(__file__).resolve().parents[3] / "src/lib/fit/motion.ts").read_text("utf-8")
    block = ts[ts.index("export const BONES = [") : ts.index("] as const;")]
    assert re.findall(r'"([^"]+)"', block) == list(skin.BONES)


@pytest.mark.anny
def test_rewrite_builds_the_body_file_from_stored_parameters_in_any_key_order(tmp_path, capsys):
    import fit
    from body import LOCAL, PHENOTYPES

    # The database returns keys in its own order: values must be matched by name.
    pheno = dict(zip(PHENOTYPES, [1.0, 0.75, 0.5, 0.9, 0.5, 0.5]))
    params = {"phenotype": dict(reversed(list(pheno.items()))),
              "local": {k: 0.0 for k in reversed(LOCAL)}}
    src, a, b = tmp_path / "p.json", tmp_path / "a.glb", tmp_path / "b.glb"
    src.write_text(json.dumps(params))
    assert fit.main(["fit.py", "--rewrite", str(src), "--glb", str(a)]) == 0
    assert json.loads(capsys.readouterr().out.strip().splitlines()[-1]) == {
        "status": "ok", "bodyVersion": 2}
    src.write_text(json.dumps({"phenotype": pheno, "local": dict.fromkeys(LOCAL, 0.0)}))
    assert fit.main(["fit.py", "--rewrite", str(src), "--glb", str(b)]) == 0
    assert a.read_bytes() == b.read_bytes()
    assert len(read_glb(a)["skins"][0]["joints"]) == 36
