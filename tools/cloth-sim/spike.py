"""Phase 6 spike (go / no-go): can Blender's cloth drape a tee on a buyer's body fast enough?

Not production code: it measures the go criteria in SPIKE.md. Runs inside Blender (GPL, a
separate process) on the same garment, poses and cloth set-up as the tool (run.py, simulate.py):

    "$BLENDER_BIN" -b --factory-startup -t 8 -P tools/cloth-sim/spike.py -- BODY.glb OUT_DIR [SIZE ...]

BODY.glb is a skinned body file (tools/body-fitting `write_body`; Dilan: 172 cm, chest 100,
waist 88, hip 98). The tee is the body's covered surface pushed out to each size's room; where
the chart is smaller than the body, its springs' rest shape is taken in round the body
(garment.py `rest`). The body is the collider and plays WALK then REACH (src/lib/fit/motion.ts),
40 frames each at 25 fps, after 30 frames settling. Per size: OUT_DIR/<size>.npz (per-frame,
per-vertex edge strain) and spike-<size>.json.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import garment  # noqa: E402
import pose  # noqa: E402
import run  # noqa: E402
import simulate  # noqa: E402

# Chart circumferences (cm). Dilan's chest is 100: the crew tee's M (102) fits; two sizes either
# side, at the chart's 6-7 cm steps.
SIZES = {
    "fit": {"chest": 102, "waist": 98, "upperArm": 36},
    "small2": {"chest": 90, "waist": 86, "upperArm": 32},
    "large2": {"chest": 116, "waist": 112, "upperArm": 40},
}
FABRIC = {"gsm": 180, "stretch_pct": 5, "weave": "Cotton jersey"}  # the crew tee


def inside_fraction(traj: np.ndarray, bodies: np.ndarray, normals: list[np.ndarray]) -> list[float]:
    """Share of garment vertices more than 3 mm behind the skin, per frame (nearest body vertex)."""
    out = []
    for f in range(len(traj)):
        b, t = bodies[f].astype(np.float32), traj[f].astype(np.float32)
        near = ((b * b).sum(1)[None, :] - 2 * t @ b.T).argmin(1)
        out.append(float((((traj[f] - b[near]) * normals[f][near]).sum(1) < -0.003).mean()))
    return out


def main(argv: list[str]) -> None:
    body_path, out = argv[0], Path(argv[1])
    out.mkdir(parents=True, exist_ok=True)
    names = argv[2:] or list(SIZES)
    body = garment.read_body(body_path)
    job = {"cls": "top", "short": False, "fabric": FABRIC}
    frames = run.timeline(["WALK", "REACH"])
    bodies = np.stack([pose.skin(body.positions, body.joints, body.weights,
                                 pose.skin_matrices(body.names, body.parents, body.heads, a, d))
                       for a, d in frames])
    for name in names:
        t0 = time.perf_counter()
        g, arrays = run.prepare(body, job, SIZES[name], frames, bodies)
        src, dst = out / f"{name}-in.npz", out / f"{name}-out.npz"
        np.savez(src, **arrays)
        prep = time.perf_counter() - t0
        t1 = time.perf_counter()
        simulate.run(str(src), str(dst))
        sim = time.perf_counter() - t1
        traj = np.load(dst)["traj"].astype(np.float64)
        strain = run.vertex_strain(g.rest, g.edges, traj)
        motion = slice(run.SETTLE, len(traj))
        chest = g.part == garment.PART["chest"]
        check = list(range(run.SETTLE - 1, len(traj), 3))
        normals = [garment.vertex_normals(bodies[f], body.faces) for f in check]
        inside = inside_fraction(traj[check], bodies[check], normals)
        r = {
            "size": name, "chart": SIZES[name], "garment_vertices": len(g.vertices),
            "body_vertices": len(body.positions), "frames": len(traj),
            "prepare_s": round(prep, 1), "simulate_s": round(sim, 1),
            "body_girth": {k: round(v, 1) for k, v in g.body_girth.items()},
            "shell_girth": {k: round(v, 1) for k, v in g.shell_girth.items()},
            "rest_scale": {k: round(g.rest_scale[garment.REGION_ID[k]], 3) for k in SIZES[name]},
            "max_distance_m": round(run.furthest(traj, bodies), 3),
            "finite": bool(np.isfinite(traj).all()),
            "inside_settled": round(inside[0], 3), "inside_max": round(max(inside), 3),
            "settled_chest_strain": round(float(strain[run.SETTLE - 1][chest].mean()), 4),
            "mean_chest_strain": round(float(strain[motion][:, chest].mean()), 4),
            "tension": run.tension(strain[run.SETTLE - 1:], g.region, FABRIC["stretch_pct"]),
            "pinned": int(arrays["pin"].sum()),
        }
        np.savez_compressed(out / f"{name}.npz", strain=strain.astype(np.float32), part=g.part,
                            traj=traj.astype(np.float32))
        src.unlink()
        (out / f"spike-{name}.json").write_text(json.dumps(r, indent=2), "utf-8")
        print(json.dumps(r), flush=True)


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
