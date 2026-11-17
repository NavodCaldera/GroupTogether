"""Cloth simulation of one garment on one body, every size (DEC-021, Phase 6). Plain Python.

    from run import simulate
    result = simulate(job, out_dir)            # starts Blender once per size

    python tools/cloth-sim/run.py < job.json   # job + "out_dir"; result JSON is the last stdout line

Job: {"body": glb path, "cls": "top"|"outer"|"bottom"|"dress", "short": bool,
      "sizes": {"M": {"chest": 100, ...}}, "fabric": {"gsm", "stretch_pct", "weave"},
      "motions": ["WALK", "RUN", "REACH", "SIT"]}
Result: {"status": "ok"|"failed", "sizes": {"M": {"tension": {"chest": 0.31, ...},
         "garment": "M.glb"}}, "seconds": n}  (+ "error" when failed; a size whose cloth blows up
         reads tension 1.0 everywhere with "note": "unstable" and "garment": null; a size whose
         Blender times out or crashes has no tension: "failed": true, "note": "timeout"|"crash")

Blender (GPL) runs only as a separate process (`BLENDER_BIN`, else `blender` on the PATH);
nothing from it is imported here. The garment, the poses and the strain are numpy.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.append(str(HERE.parent / "fit-simulation"))  # gltf.py; after HERE: both have simulate.py

import fabric  # noqa: E402
import garment  # noqa: E402
import pose  # noqa: E402
from gltf import Mesh, Skin, write_glb  # noqa: E402

FPS = 25
SETTLE = 30  # frames in the rest pose while the cloth takes its size and settles
MOTION_FRAMES = 40  # per motion, real time at 25 fps
BLEND = 12  # frames easing from the rest pose into a motion and back
THREADS = 8  # per Blender process
EXPLODED_M = 0.5  # a garment vertex this far from the body means the simulation blew up
REGION_NAME = {v: k for k, v in garment.REGION_ID.items()}
SIZE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,31}$")


def blender_bin() -> str | None:
    b = os.environ.get("BLENDER_BIN") or "blender"
    return b if Path(b).is_file() else shutil.which(b)


def _towards(angles: dict, drop: float, f: float) -> tuple[dict, float]:
    return {b: a * f for b, a in angles.items()}, drop * f


def timeline(motions: list[str]) -> list[tuple[dict, float]]:
    """(bone angles, hip drop) per frame: settle, then each motion eased in from the rest pose
    and back out to it (a clip's first pose can be far from rest: arms down for WALK)."""
    frames: list[tuple[dict, float]] = [({}, 0.0)] * SETTLE
    for m in motions:
        clip = [(pose.pose_at(m, f / FPS), pose.drop_at(m, f / FPS)) for f in range(MOTION_FRAMES)]
        frames += [_towards(*clip[0], (j + 1) / (BLEND + 1)) for j in range(BLEND)]
        frames += clip
        frames += [_towards(*clip[-1], 1 - (j + 1) / (BLEND + 1)) for j in range(BLEND)]
    return frames


def pinned(g: garment.Garment, body: garment.Body, cls: str) -> np.ndarray:
    """The opening the garment hangs from, which follows the body: the neckline of a top or
    dress, the waistband of a bottom. Without it a tight size slides along the body."""
    p = g.vertices
    if cls == "bottom":
        return g.rim & (p[:, 1] > p[g.rim, 1].max() - 0.04)
    sh = body.bone("upperarm01.L")
    return g.rim & (p[:, 1] > sh[1] - 0.02) & (np.abs(p[:, 0]) < abs(sh[0]) * 0.8)


def skinned(points: np.ndarray, joints: np.ndarray, weights: np.ndarray, body: garment.Body,
            frames: list) -> np.ndarray:
    return np.stack([pose.skin(points, joints.astype(int), weights.astype(float),
                               pose.skin_matrices(body.names, body.parents, body.heads, a, d))
                     for a, d in frames])


def vertex_strain(rest: np.ndarray, edges: np.ndarray, traj: np.ndarray,
                  follow: np.ndarray | None = None) -> np.ndarray:
    """(frames, vertices): mean strain of each vertex's edges against their rest lengths.

    `follow` (frames, vertices, 3) is the garment carried by the skin alone (no cloth). Where the
    moving body stretches its own surface (a shoulder as the arm lifts), an edge's rest length
    stretches with it: what counts is the strain the cloth adds beyond the skin's own."""
    rest_len = np.linalg.norm(rest[edges[:, 0]] - rest[edges[:, 1]], axis=1)
    ref = np.broadcast_to(rest_len, (len(traj), len(edges)))
    if follow is not None:
        start = np.linalg.norm(follow[0][edges[:, 0]] - follow[0][edges[:, 1]], axis=1)
        now = np.linalg.norm(follow[:, edges[:, 0]] - follow[:, edges[:, 1]], axis=2)
        ref = ref * np.maximum(1.0, now / np.maximum(start, 1e-9))
    length = np.linalg.norm(traj[:, edges[:, 0]] - traj[:, edges[:, 1]], axis=2)
    strain = length / np.maximum(ref, 1e-9) - 1
    out = np.zeros((len(traj), len(rest)))
    count = np.zeros(len(rest))
    for c in (0, 1):
        np.add.at(out.T, edges[:, c], strain.T)
        np.add.at(count, edges[:, c], 1)
    return out / np.maximum(count, 1)


PINCH_M = 0.025  # cloth this close to two body parts at once is caught between them
_P = garment.PART
_ARM = [_P["upperArm"], _P["lowerArm"], _P["end"]]
_TORSO = [_P["chest"], _P["waist"], _P["hip"], _P["seat"], _P["shoulder"]]
_LEG = [_P["thigh"], _P["lowerLeg"]]


def pinched(traj: np.ndarray, bodies: np.ndarray, body: garment.Body) -> np.ndarray:
    """(frames, vertices): cloth caught between an arm and the torso, or between the legs. Its
    strain is the squeeze of two colliding body surfaces, not the garment's size, so it is left
    out of the tension (the arms hang against the sides in WALK, RUN and SIT)."""
    parts, x = body.parts, body.positions[:, 0]
    pairs = [(np.isin(parts, _ARM), np.isin(parts, _TORSO)),
             (np.isin(parts, _LEG) & (x > 0), np.isin(parts, _LEG) & (x <= 0))]
    out = np.zeros(traj.shape[:2], bool)

    def near(p, q):
        d2 = (q * q).sum(1)[None, :] - 2 * p @ q.T + (p * p).sum(1)[:, None]
        return d2.min(axis=1) < PINCH_M ** 2

    for f in range(len(traj)):
        p = traj[f].astype(np.float32)
        for a, b in pairs:
            qa = bodies[f][a][::2].astype(np.float32)
            qb = bodies[f][b][::2].astype(np.float32)
            out[f] |= near(p, qa) & near(p, qb)
    return out


# The loose side of the scale (src/lib/fit/config.ts): `snugFrom`, and per garment type and area
# the room (cm) past which an area reads loose, `EASE[cls][region].looseAt`. A test keeps these
# equal to the app's.
SNUG_FROM = 0.6
LOOSE_AT = {
    "top": {"chest": 16, "waist": 18, "hip": 14, "upperArm": 10, "shoulder": 4, "torso": 10},
    "outer": {"chest": 16, "waist": 18, "hip": 14, "upperArm": 10, "shoulder": 5, "torso": 10},
    "bottom": {"waist": 6, "hip": 12, "thigh": 10},
    "dress": {"chest": 14, "waist": 14, "hip": 16, "shoulder": 4, "torso": 10},
}


def slack(room_cm: float, loose_at: float) -> float:
    """Tension of cloth that is not stretched: `SNUG_FROM` with no room, falling off with the
    room the chart leaves round the body. Strain cannot tell a comfortable area from a loose
    one (both hang at zero strain), so this side comes from the garment's room on this body."""
    return SNUG_FROM * float(np.exp(-max(room_cm, 0.0) / loose_at))


def tension(strain: np.ndarray, region: np.ndarray, stretch_pct: float | None,
            keep: np.ndarray | None = None, room: dict[str, float] | None = None,
            cls: str = "top") -> dict[str, float]:
    """Per fit area, 0 slack to 1 tight: the 95th percentile of strain over its vertices and all
    frames (only where `keep`) over the fabric's stretch capacity, or, where that is lower, the
    slack reading from the area's `room`."""
    cap = fabric.capacity(stretch_pct)
    keep = np.ones(strain.shape, bool) if keep is None else keep
    out = {}
    for rid in np.unique(region):
        if int(rid) == garment.NEUTRAL:
            continue
        name = REGION_NAME[int(rid)]
        m = region == rid
        values = strain[:, m][keep[:, m]]
        if not values.size:
            values = strain[:, m].ravel()
        t = float(np.clip(np.percentile(values, 95) / cap, 0, 1))
        if room and name in room and name in LOOSE_AT.get(cls, {}):
            t = max(t, slack(room[name], LOOSE_AT[cls][name]))
        out[name] = round(t, 4)
    return out


def unstable(region: np.ndarray) -> dict:
    names = [REGION_NAME[int(r)] for r in np.unique(region) if int(r) != garment.NEUTRAL]
    return {"tension": {n: 1.0 for n in names}, "garment": None, "note": "unstable"}


def failed(note: str, error: str | None = None) -> dict:
    """Blender timed out or crashed: no reading at all (a busy machine, not the garment), so a
    batch does not keep it and tries the size again."""
    return {"failed": True, "note": note, "garment": None, **({"error": error} if error else {})}


def furthest(traj: np.ndarray, bodies: np.ndarray) -> float:
    """Largest distance from a garment vertex to the nearest (sampled) body vertex, any frame."""
    far = 0.0
    for f in range(len(traj)):
        b = bodies[f][::5].astype(np.float32)
        d2 = ((traj[f][:, None, :].astype(np.float32) - b[None]) ** 2).sum(-1).min(1)
        far = max(far, float(np.sqrt(d2.max())))
    return far


CLEAR_M = garment.MIN_GAP_CM / 100
REACH_M = 0.06  # deeper than this inside a limb is not inside it: a limb is thinner


def _nearest(p: np.ndarray, q: np.ndarray) -> np.ndarray:
    """Index into `q` of the nearest point to each of `p`."""
    p32, q32 = p.astype(np.float32), q.astype(np.float32)
    qq = (q32 * q32).sum(1)
    out = np.empty(len(p), dtype=np.int64)
    for s in range(0, len(p), 512):
        c = p32[s:s + 512]
        out[s:s + 512] = (qq[None, :] - 2 * c @ q32.T).argmin(axis=1)
    return out


def clear_of_limbs(goal: np.ndarray, g: garment.Garment, body: garment.Body,
                   body_frames: np.ndarray) -> np.ndarray:
    """The skinned drape kept `CLEAR_M` outside the body parts that do not carry it.

    Skinning moves torso cloth with the torso and sleeve cloth with the arm, so where an arm
    swings down against the side (WALK, RUN, SIT) the torso's drape lies inside the arm and the
    sleeve's inside the torso. The soft goal and the pins then pull that cloth into a collider
    that pushes it back out: the cloth is stretched round the arm whatever its size, and the
    looser the size the more cloth hangs in the arm's way. Each such drape vertex is moved out
    along the nearest skin vertex's normal of the other part."""
    out = goal.copy()
    bp, gp = body.parts, g.part
    arm = np.isin(bp, _ARM)
    torso_b = np.isin(bp, _TORSO)
    groups = [
        (np.isin(gp, _TORSO), arm),
        (np.isin(gp, _ARM) & (g.vertices[:, 0] > 0), torso_b | (arm & (body.positions[:, 0] <= 0))),
        (np.isin(gp, _ARM) & (g.vertices[:, 0] <= 0), torso_b | (arm & (body.positions[:, 0] > 0))),
    ]
    normals = [garment.vertex_normals(b, body.faces) for b in body_frames]

    def need(f, ci, oi):
        b = body_frames[f]
        k = oi[_nearest(goal[f, ci], b[oi])]
        d = goal[f, ci] - b[k]
        off = (d * normals[f][k]).sum(axis=1)
        inside = (d * d).sum(axis=1) < REACH_M ** 2
        return np.where(inside, np.maximum(0.0, CLEAR_M - off), 0.0), normals[f][k]

    for cloth, other in groups:
        ci, oi = np.flatnonzero(cloth), np.flatnonzero(other)
        if not len(ci) or not len(oi):
            continue
        # What already sits that close standing (the seam under the arm) stays where it is.
        start, _ = need(0, ci, oi)
        for f in range(1, len(goal)):
            n, normal = need(f, ci, oi)
            out[f, ci] += normal * np.maximum(0.0, n - start)[:, None]
    return out


def prepare(body: garment.Body, job: dict, chart: dict, frames: list,
            body_frames: np.ndarray) -> tuple[garment.Garment, dict]:
    """The garment for one size and the arrays simulate.py reads."""
    g = garment.build(body, job["cls"], bool(job.get("short")), chart)
    fab = job.get("fabric") or {}
    params = fabric.params(fab.get("gsm"), fab.get("stretch_pct"), fab.get("weave"))
    base = clear_of_limbs(skinned(g.drape, g.joints, g.weights, body, frames), g, body, body_frames)
    return g, {"body": body_frames.astype(np.float32), "body_faces": body.faces,
               "garment": base.astype(np.float32), "garment_faces": g.faces,
               "rest": g.rest.astype(np.float32), "pin": pinned(g, body, job["cls"]),
               "fps": FPS, "fabric": json.dumps(params)}


def strain_of(g: garment.Garment, body: garment.Body, traj: np.ndarray, body_frames: np.ndarray,
              garment_frames: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Strain and the vertices it is read from, frames from the settled one on."""
    t, follow = traj[SETTLE - 1:], garment_frames[SETTLE - 1:]
    strain = vertex_strain(g.rest, g.edges, t, follow)
    keep = ~pinched(t, body_frames[SETTLE - 1:], body) & ~g.rim[None, :]
    return strain, keep


def measure(g: garment.Garment, body: garment.Body, traj: np.ndarray, body_frames: np.ndarray,
            garment_frames: np.ndarray, stretch_pct: float | None, cls: str = "top") -> dict | None:
    """Tension per area, or None when the simulation blew up."""
    if not np.isfinite(traj).all() or furthest(traj, body_frames) > EXPLODED_M:
        return None
    strain, keep = strain_of(g, body, traj, body_frames, garment_frames)
    return tension(strain, g.region, stretch_pct, keep, g.room, cls)


def write_garment(path: Path, g: garment.Garment, body: garment.Body, traj: np.ndarray) -> None:
    """The settled garment (last frame before the first motion) with the body's skeleton."""
    skin = Skin(names=list(body.names), parents=list(body.parents),
                heads=body.heads.astype(np.float32), joints=g.joints, weights=g.weights)
    write_glb(str(path), [Mesh("garment", traj[SETTLE - 1].astype(np.float32),
                               g.faces.reshape(-1).astype(np.uint32),
                               region_ids=g.region.astype(np.float32), skin=skin)],
              np.zeros(0), np.zeros((0, 0)), "rest")


def _one_size(blender: str, body: garment.Body, job: dict, name: str, chart: dict,
              frames: list, body_frames: np.ndarray, out: Path, timeout_s: int) -> dict:
    started = time.monotonic()
    g, arrays = prepare(body, job, chart, frames, body_frames)
    with tempfile.TemporaryDirectory(prefix="cloth-") as tmp:
        src, dst = Path(tmp) / "in.npz", Path(tmp) / "out.npz"
        np.savez(src, **arrays)
        cmd = [blender, "-b", "--factory-startup", "-t", str(THREADS), "-P",
               str(HERE / "simulate.py"), "--", str(src), str(dst)]
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
        except subprocess.TimeoutExpired:
            return failed("timeout")
        if p.returncode != 0 or not dst.exists():
            return failed("crash", (p.stderr or p.stdout)[-500:])
        traj = np.load(dst)["traj"].astype(np.float64)
    t = measure(g, body, traj, body_frames, arrays["garment"].astype(np.float64),
                (job.get("fabric") or {}).get("stretch_pct"), job["cls"])
    if t is None:
        return unstable(g.region)
    write_garment(out / f"{name}.glb", g, body, traj)
    return {"tension": t, "garment": f"{name}.glb", "seconds": round(time.monotonic() - started, 1)}


def simulate(job: dict, out_dir: str, timeout_s: int = 600) -> dict:
    started = time.monotonic()

    def done(status: str, sizes: dict, error: str | None = None) -> dict:
        r = {"status": status, "sizes": sizes, "seconds": round(time.monotonic() - started, 1)}
        return {**r, "error": error} if error else r

    try:
        body = garment.read_body(job["body"])
    except (OSError, KeyError, ValueError) as e:
        return done("failed", {}, f"body: {e}")
    if job.get("cls") not in garment.COVER:
        return done("failed", {}, f"unknown garment class {job.get('cls')!r}")
    sizes = job.get("sizes") or {}
    bad = [s for s in sizes if not SIZE_NAME.match(s)]
    if not sizes or bad:
        return done("failed", {}, f"bad sizes {bad}" if bad else "no sizes")
    motions = [m for m in job.get("motions") or list(pose.MOTIONS)]
    if any(m not in pose.CLIPS for m in motions):
        return done("failed", {}, f"unknown motion in {motions}")
    blender = blender_bin()
    if not blender:
        return done("failed", {}, "Blender not found: set BLENDER_BIN")
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    frames = timeline(motions)
    body_frames = np.stack([pose.skin(body.positions, body.joints, body.weights,
                                      pose.skin_matrices(body.names, body.parents, body.heads, a, d))
                            for a, d in frames])
    workers = max(1, min(len(sizes), (os.cpu_count() or THREADS) // THREADS))
    with ThreadPoolExecutor(workers) as pool:
        futures = {s: pool.submit(_one_size, blender, body, job, s, c, frames, body_frames, out,
                                  timeout_s) for s, c in sizes.items()}
        results = {s: f.result() for s, f in futures.items()}
    return done("ok", results)


def main() -> int:
    try:
        job = json.loads(sys.stdin.read())
        out_dir = job.pop("out_dir")
    except (ValueError, KeyError, AttributeError) as e:
        print(json.dumps({"status": "failed", "sizes": {}, "seconds": 0, "error": f"job: {e}"}))
        return 2
    timeout_s = int(job.pop("timeout_s", 600))
    print(json.dumps(simulate(job, out_dir, timeout_s)), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
