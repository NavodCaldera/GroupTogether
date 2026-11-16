"""Offline fit simulation pipeline (DEC-020).

    python tools/fit-simulation/pipeline.py GARMENT.json OUT_DIR [--archetypes A.json]
        [--engine analytic|blender] [--no-meshes]

For every archetype × motion it writes `<archetype>/<motion>-<hash>.glb` (an animated garment
on the archetype body, with the baked `_REGION_ID` attribute), and one `manifest.json` with the
archetypes, assets and per-size area tensions. `load.ts` copies the files to the asset host and
inserts the database rows. Output is deterministic, so files are named by content hash and can
be cached forever. `--no-meshes` writes only the manifest: the standard shapes have Anny body
files (anny_bodies.py) and the viewer draws the garment over them in the browser.
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


def run(garment_path: str, out_dir: str, archetypes_path: str | None, engine: str,
        meshes: bool = True) -> dict:
    garment = json.loads(Path(garment_path).read_text(encoding="utf-8"))
    # Men's garments run on men's archetypes, women's on women's.
    bodies = [a for a in arch.load(archetypes_path)
              if a["gender"] == garment.get("audience", a["gender"])]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    assets, rows = [], []
    # A report-only garment (no 3D yet, e.g. trousers and dresses until the mesh generator
    # covers them) ships its size chart and fabric with no assets or tensions.
    for a in bodies if garment.get("simulate", True) else []:
        size = nearest_size(garment, a["params"])
        rows += tensions(garment, a, engine)
        if not meshes:
            continue
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
    ap.add_argument("garment", help="garment JSON, or a folder of them with --all")
    ap.add_argument("out", help="output folder, or with --all the folder for seed-<name>/")
    ap.add_argument("--archetypes")
    ap.add_argument("--engine", default="analytic", choices=["analytic", "blender"])
    ap.add_argument("--all", action="store_true", help="every *.json in the garment folder")
    ap.add_argument("--no-meshes", action="store_true", help="tensions only, no garment files")
    args = ap.parse_args()
    jobs = ([(str(g), str(Path(args.out) / f"seed-{g.stem}"))
             for g in sorted(Path(args.garment).glob("*.json"))]
            if args.all else [(args.garment, args.out)])
    for garment, out in jobs:
        m = run(garment, out, args.archetypes, args.engine, not args.no_meshes)
        print(f"{len(m['assets'])} assets, {len(m['tensions'])} tension rows -> {out}")
