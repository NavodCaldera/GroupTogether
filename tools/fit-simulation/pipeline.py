"""Offline fit simulation pipeline (DEC-020).

    python tools/fit-simulation/pipeline.py GARMENT.json OUT_DIR [--archetypes A.json]
        [--engine analytic|blender]

For every archetype × motion it writes `<archetype>/<motion>-<hash>.glb` (an animated garment
on the archetype body, with the baked `_REGION_ID` attribute), and one `manifest.json` with the
archetypes, assets and per-size area tensions. `load.ts` copies the files to the asset host and
inserts the database rows. Output is deterministic, so files are named by content hash and can
be cached forever.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import archetypes as arch  # noqa: E402
from gltf import write_glb  # noqa: E402
from mesh import animate, body_mesh, garment_mesh  # noqa: E402
from simulate import tensions  # noqa: E402

MOTIONS = ["WALK", "RUN", "REACH", "SIT"]


def nearest_size(garment: dict, params: dict) -> str:
    """The size the archetype would wear: smallest chest at least the body's."""
    sizes = list(garment["size_chart"])
    for s in sizes:
        if garment["size_chart"][s].get("chest", 0) >= params["chest"] + 4:
            return s
    return sizes[-1]


def run(garment_path: str, out_dir: str, archetypes_path: str | None, engine: str) -> dict:
    garment = json.loads(Path(garment_path).read_text(encoding="utf-8"))
    bodies = arch.load(archetypes_path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    assets, rows = [], []
    for a in bodies:
        size = nearest_size(garment, a["params"])
        rows += tensions(garment, a, engine)
        (out / a["name"]).mkdir(exist_ok=True)
        for motion in MOTIONS:
            body = body_mesh(a["params"])
            cloth = garment_mesh(a["params"], garment["size_chart"][size])
            times, weights = animate([body, cloth], motion)
            tmp = out / a["name"] / f"{motion.lower()}.tmp.glb"
            write_glb(str(tmp), [body[0], cloth[0]], times, weights, motion.lower())
            digest = hashlib.sha256(tmp.read_bytes()).hexdigest()[:10]
            final = out / a["name"] / f"{motion.lower()}-{digest}.glb"
            for old in (out / a["name"]).glob(f"{motion.lower()}-*.glb"):
                old.unlink()
            tmp.replace(final)
            assets.append({"archetype": a["name"], "motion": motion,
                           "file": f"{a['name']}/{final.name}", "size": size})
    manifest = {"garment": garment, "archetypes": bodies, "assets": assets, "tensions": rows,
                "engine": engine}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("garment")
    ap.add_argument("out")
    ap.add_argument("--archetypes")
    ap.add_argument("--engine", default="analytic", choices=["analytic", "blender"])
    args = ap.parse_args()
    m = run(args.garment, args.out, args.archetypes, args.engine)
    print(f"{len(m['assets'])} assets, {len(m['tensions'])} tension rows -> {args.out}")
