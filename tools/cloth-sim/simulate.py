"""Blender cloth step (DEC-021, Phase 6). Runs INSIDE Blender, started by run.py:

    blender -b --factory-startup -t 8 -P tools/cloth-sim/simulate.py -- in.npz out.npz

Blender is GPL and runs only as this separate process; the app never imports it. Everything
the scene needs comes in `in.npz` (written by run.py, body-file axes: Y up, facing +Z):
  body (frames, n, 3)         the posed body per frame: the collider
  body_faces (m, 3)
  garment (frames, g, 3)      the garment where it sits (garment.py drape) skinned to each
                              frame: the pinned opening
                              follows it, and frame 0 is where the cloth starts
  garment_faces (k, 3)
  rest (g, 3)                 the garment at its size: the springs' rest lengths
  pin (g,) bool               the opening the garment hangs from
  fps
  fabric                      JSON, fabric.params()
Writes `out.npz`: traj (frames, g, 3) the simulated garment, body-file axes; seconds.
"""

from __future__ import annotations

import json
import os
import sys
import time

import bpy
import numpy as np

# Collision: the body's outer thickness plus the cloth's distance stay below garment.MIN_GAP_CM.
BODY_THICKNESS = 0.004
CLOTH_DISTANCE = 0.005
COLLISION_QUALITY = 3
STEPS = 5  # cloth quality: substeps per frame
FRICTION = 0.5  # low, so cloth dragged by a moving arm slides back
PIN_STIFFNESS = 30.0
# Every other vertex is pulled lightly towards where it sits on the standing body, carried by
# the skin (garment.py `drape`), so cloth dragged where the arm folds against the torso returns.
SOFT_GOAL = 0.5


def to_blender(p: np.ndarray) -> np.ndarray:
    """Body-file axes to Blender's (Z up, facing -Y), as Blender's glTF importer does."""
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


def from_blender(p: np.ndarray) -> np.ndarray:
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], axis=-1)


def mesh_object(name: str, verts: np.ndarray, faces: np.ndarray):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts.tolist(), [], faces.tolist())
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def animate(ob, frames: np.ndarray) -> None:
    """One shape key per frame that differs from the first, each fully on at its own frame."""
    ob.shape_key_add(name="Basis")
    for f in range(1, len(frames)):
        if np.array_equal(frames[f], frames[0]):
            continue
        key = ob.shape_key_add(name=f"f{f + 1}", from_mix=False)
        key.data.foreach_set("co", frames[f].astype(np.float32).ravel())
        for at, v in ((f, 0.0), (f + 1, 1.0), (f + 2, 0.0)):
            key.value = v
            key.keyframe_insert("value", frame=at)
    if ob.data.shape_keys.animation_data:
        for fc in ob.data.shape_keys.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"


def run(src: str, dst: str) -> None:
    d = np.load(src)
    fab = json.loads(str(d["fabric"]))
    bodies, garments = to_blender(d["body"]), to_blender(d["garment"])
    n = len(bodies)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = int(d["fps"])
    scene.frame_start, scene.frame_end = 1, n

    body = mesh_object("body", bodies[0], d["body_faces"])
    animate(body, bodies)
    body.modifiers.new("Collision", "COLLISION")
    body.collision.thickness_outer = BODY_THICKNESS
    # One-sided: cloth that gets behind the skin is pushed back out, not held inside.
    body.collision.use_culling = True
    body.collision.use_normal = True
    body.collision.cloth_friction = float(os.environ.get("CLOTH_FRICTION", FRICTION))
    body.collision.damping = 0.0

    g = mesh_object("garment", garments[0], d["garment_faces"])
    animate(g, garments)
    # The springs' rest lengths come from the garment at its size (smaller than the shell
    # where the size is tight: that is the tension).
    rest = g.shape_key_add(name="rest", from_mix=False)
    rest.data.foreach_set("co", to_blender(d["rest"]).astype(np.float32).ravel())
    rest.value = 0.0
    pin = g.vertex_groups.new(name="pin")
    goal = np.where(d["pin"], 1.0, float(os.environ.get("CLOTH_SOFT_GOAL", SOFT_GOAL)))
    for i in np.flatnonzero(goal > 0):
        pin.add([int(i)], float(goal[i]), "REPLACE")

    cloth = g.modifiers.new("Cloth", "CLOTH")
    s = cloth.settings
    s.quality = STEPS
    tri = garments[0][d["garment_faces"]]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1).sum()
    s.mass = fab["mass"] * area / len(d["rest"])  # Blender's mass is per vertex
    for key in ("tension_stiffness", "compression_stiffness", "shear_stiffness",
                "bending_stiffness", "air_damping"):
        setattr(s, key, fab[key])
    s.rest_shape_key = rest
    s.vertex_group_mass = "pin"
    s.pin_stiffness = float(os.environ.get("CLOTH_PIN_STIFFNESS", PIN_STIFFNESS))
    c = cloth.collision_settings
    c.use_collision = True
    c.use_self_collision = False
    c.distance_min = CLOTH_DISTANCE
    c.collision_quality = COLLISION_QUALITY
    cloth.point_cache.frame_start, cloth.point_cache.frame_end = 1, n

    started = time.perf_counter()
    nv = len(d["rest"])
    traj = np.zeros((n, nv, 3), dtype=np.float32)
    buf = np.zeros(nv * 3, dtype=np.float32)
    for f in range(1, n + 1):
        scene.frame_set(f)
        ev = g.evaluated_get(bpy.context.evaluated_depsgraph_get())
        ev.data.vertices.foreach_get("co", buf)
        traj[f - 1] = buf.reshape(-1, 3)
    np.savez(dst, traj=from_blender(traj), seconds=time.perf_counter() - started)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    run(args[0], args[1])
