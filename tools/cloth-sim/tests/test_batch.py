"""Batch of garments × standard shapes (DEC-021, Task 6.4), with a fake run.simulate: no Blender."""

from __future__ import annotations

import json
import sys
import threading
import time
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

import batch  # noqa: E402


def export(hash_="h1", gender="MEN"):
    return {
        "products": [{
            "id": "p1", "title": "Tee", "fitDataHash": hash_, "gender": gender,
            "job": {"cls": "top", "short": False,
                    "sizes": {"M": {"chest": 102}, "L": {"chest": 108}},
                    "fabric": {"gsm": 180, "stretch_pct": 5, "weave": "Jersey"},
                    "motions": ["WALK"]},
        }],
        "archetypes": [{"name": "men-01", "gender": "MEN", "body": "men-01.glb"},
                       {"name": "men-02", "gender": "MEN", "body": "men-02.glb"},
                       {"name": "women-01", "gender": "WOMEN", "body": "women-01.glb"}],
    }


@pytest.fixture
def fake(monkeypatch):
    calls: list[dict] = []
    live = {"now": 0, "max": 0}
    lock = threading.Lock()

    def simulate(job, out_dir, timeout_s=600):
        with lock:
            calls.append(job)
            live["now"] += 1
            live["max"] = max(live["max"], live["now"])
        time.sleep(0.05)
        (size,) = job["sizes"]
        with lock:
            live["now"] -= 1
        if job["body"] == "broken.glb":
            return {"status": "failed", "sizes": {}, "seconds": 0, "error": "body: missing"}
        if size == "L" and job["body"] == "men-02.glb":
            return {"status": "ok", "seconds": 1, "sizes": {size: {
                "tension": {"chest": 1.0}, "garment": None, "note": "unstable"}}}
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        (Path(out_dir) / f"{size}.glb").write_bytes(b"glTF")
        return {"status": "ok", "seconds": 1, "sizes": {size: {
            "tension": {"chest": 0.5}, "garment": f"{size}.glb", "seconds": 1}}}

    monkeypatch.setattr(batch.run, "simulate", simulate)
    return calls, live


def test_every_size_on_every_shape_of_the_gender_into_one_manifest(fake, tmp_path):
    calls, live = fake
    summary = batch.batch(export(), str(tmp_path), parallel=2, log=lambda *_: None)
    assert summary["simulated"] == 4 and not summary["failed"]
    assert sorted(c["body"] for c in calls) == ["men-01.glb"] * 2 + ["men-02.glb"] * 2
    assert all(len(c["sizes"]) == 1 and c["cls"] == "top" for c in calls)
    assert live["max"] == 2
    m = json.loads((tmp_path / "manifest.json").read_text("utf-8"))
    (p,) = m["products"]
    assert p["id"] == "p1" and p["fitDataHash"] == "h1"
    drapes = {(d["archetype"], d["size"]): d for d in p["drapes"]}
    assert drapes[("men-01", "M")] == {"archetype": "men-01", "size": "M",
                                       "tension": {"chest": 0.5}, "garment": "p1/men-01/M.glb"}
    assert (tmp_path / "p1/men-01/M.glb").is_file()
    assert drapes[("men-02", "L")]["garment"] is None
    assert drapes[("men-02", "L")]["note"] == "unstable"


def test_no_gender_runs_on_every_shape(fake, tmp_path):
    calls, _ = fake
    batch.batch(export(gender=None), str(tmp_path), parallel=3, log=lambda *_: None)
    assert len(calls) == 6


def test_a_rerun_resumes_and_a_fit_data_change_simulates_again(fake, tmp_path):
    calls, _ = fake
    batch.batch(export(), str(tmp_path), log=lambda *_: None)
    calls.clear()
    (tmp_path / "p1/men-01/L.json").unlink()  # the batch stopped before this size finished
    summary = batch.batch(export(), str(tmp_path), log=lambda *_: None)
    assert [(c["body"], *c["sizes"]) for c in calls] == [("men-01.glb", "L")]
    assert summary["simulated"] == 1
    assert len(json.loads((tmp_path / "manifest.json").read_text("utf-8"))["products"][0]["drapes"]) == 4

    calls.clear()
    batch.batch(export(hash_="h2"), str(tmp_path), log=lambda *_: None)
    assert len(calls) == 4


def test_a_failed_job_is_reported_and_tried_again_next_time(fake, tmp_path):
    calls, _ = fake
    e = export()
    e["archetypes"][0]["body"] = "broken.glb"
    summary = batch.batch(e, str(tmp_path), log=lambda *_: None)
    assert sorted(summary["failed"]) == ["p1/men-01/L", "p1/men-01/M"]
    m = json.loads((tmp_path / "manifest.json").read_text("utf-8"))
    assert {d["archetype"] for d in m["products"][0]["drapes"]} == {"men-02"}
    calls.clear()
    batch.batch(e, str(tmp_path), log=lambda *_: None)
    assert len(calls) == 2


def test_bad_size_names_are_refused(fake, tmp_path):
    e = export()
    e["products"][0]["job"]["sizes"] = {"../x": {"chest": 1}}
    with pytest.raises(ValueError, match="bad size"):
        batch.batch(e, str(tmp_path), log=lambda *_: None)
