"""Render the My measurements body guide from a standard Anny body (Blender 4.5).

    "$BLENDER_BIN" -b --factory-startup -P tools/body-guide/render.py -- BODY.glb OUT_PREFIX

Writes OUT_PREFIX.png (clay-shaded, transparent background) and OUT_PREFIX.json: for each
measurement, SVG path data in image pixels. Rings are true cross-sections of the mesh, split into
the half facing the camera ("front") and the half behind the body ("back").
"""

import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

W, H = 720, 1080
TILT = math.radians(8)  # camera looks slightly down, so rings read as ellipses
OFFSET = 0.006  # rings sit just outside the skin (m)

body_path, out = sys.argv[sys.argv.index("--") + 1 :][:2]
out = os.path.abspath(out)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=body_path)
for o in list(bpy.data.objects):
    if o.type not in {"MESH", "ARMATURE"} or (o.type == "MESH" and o.name != "body"):
        bpy.data.objects.remove(o, do_unlink=True)
body = bpy.data.objects["body"]
for p in body.data.polygons:
    p.use_smooth = True

dg = bpy.context.evaluated_depsgraph_get()
ev = body.evaluated_get(dg)
mesh = ev.to_mesh()
mw = ev.matrix_world
verts = [mw @ v.co for v in mesh.vertices]
part_attr = body.data.attributes["_BODY_PART"]
part = [int(round(part_attr.data[i].value)) for i in range(len(verts))]
zs = [v.z for v in verts]
top, bottom = max(zs), min(zs)
height = top - bottom
edges = [tuple(e.vertices) for e in mesh.edges]

# Parts seen in the Anny bodies: 0 chest, 1 waist, 2/10 hip, 3 upper arm, 4 thigh, 5 shoulder,
# 6 forearm, 7 lower leg, 8 head and neck, 9 hands and feet.
TORSO = {0, 1, 2, 5, 10}


def section(point, normal, keep):
    """Points where mesh edges cross the plane, for edges whose both ends pass `keep`."""
    out = []
    for a, b in edges:
        if not (keep(a) and keep(b)):
            continue
        da = (verts[a] - point).dot(normal)
        db = (verts[b] - point).dot(normal)
        if da == db or (da > 0) == (db > 0):
            continue
        t = da / (da - db)
        out.append(verts[a].lerp(verts[b], t))
    return out


def hull_loop(points, normal):
    """Convex hull of the section in its plane, pushed OFFSET outward, as an ordered 3D loop."""
    c = sum(points, Vector()) / len(points)
    u = (Vector((0, 0, 1)) if abs(normal.z) < 0.9 else Vector((1, 0, 0))).cross(normal).normalized()
    v = normal.cross(u).normalized()
    pts = sorted({(round((p - c).dot(u), 5), round((p - c).dot(v), 5)) for p in points})

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    loop = []
    for x, y in hull:
        r = math.hypot(x, y) or 1
        k = (r + OFFSET) / r
        loop.append(c + u * (x * k) + v * (y * k))
    # Resample evenly so the drawn ring is smooth.
    per = [(loop[i] - loop[i - 1]).length for i in range(len(loop))]
    total = sum(per)
    n = 96
    res, i, acc = [], 0, 0.0
    for s in range(n):
        target = total * s / n
        while acc + per[(i + 1) % len(loop)] < target:
            acc += per[(i + 1) % len(loop)]
            i += 1
        a, b = loop[i % len(loop)], loop[(i + 1) % len(loop)]
        seg = per[(i + 1) % len(loop)] or 1
        res.append(a.lerp(b, (target - acc) / seg))
    return res


def circumference(points, normal):
    loop = hull_loop(points, normal)
    return sum((loop[i] - loop[i - 1]).length for i in range(len(loop)))


def torso_ring(z0, z1, pick, parts=TORSO):
    """The torso section between heights z0..z1 with the largest (pick=max) or smallest girth."""
    best = None
    for k in range(25):
        z = z0 + (z1 - z0) * k / 24
        pts = section(Vector((0, 0, z)), Vector((0, 0, 1)), lambda i: part[i] in parts)
        if len(pts) < 12:
            continue
        g = circumference(pts, Vector((0, 0, 1)))
        if best is None or (g > best[0] if pick == "max" else g < best[0]):
            best = (g, z, pts)
    return hull_loop(best[2], Vector((0, 0, 1)))


def limb_ring(part_id, side, at):
    """Ring across a limb, perpendicular to its axis, `at` of the way from its top."""
    idx = [i for i in range(len(verts)) if part[i] == part_id and verts[i].x * side > 0]
    pts = sorted((verts[i] for i in idx), key=lambda p: p.z)
    # The limb's axis runs from the middle of its lowest vertices to the middle of its highest.
    n = max(1, len(pts) // 7)
    low = sum(pts[:n], Vector()) / n
    high = sum(pts[-n:], Vector()) / n
    axis = (high - low).normalized()
    point = high.lerp(low, at)
    keep = set(idx)
    sec = section(point, axis, lambda i: i in keep)
    return hull_loop(sec, axis)


# Camera: orthographic, from the front (-Y), tilted down a little.
cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.scene.collection.objects.link(cam)
mid_z = bottom + height * 0.5
cam.rotation_euler = (math.radians(90) - TILT, 0, 0)
cam.location = Vector((0, -6, mid_z)) + Vector((0, 0, 6 * math.tan(TILT)))
cam_data.ortho_scale = height * 1.12
scene = bpy.context.scene
scene.camera = cam
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.film_transparent = True
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "Standard"

# Clay material.
mat = bpy.data.materials.new("clay")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.62, 0.57, 0.53, 1)
bsdf.inputs["Roughness"].default_value = 0.6
body.data.materials.clear()
body.data.materials.append(mat)

# Soft studio light: big key above front-left, fill right, rim behind, grey world.
world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.12, 0.12, 0.13, 1)
scene.world = world


def area(name, loc, energy, size):
    d = bpy.data.lights.new(name, "AREA")
    d.energy, d.size = energy, size
    o = bpy.data.objects.new(name, d)
    o.location = loc
    direction = Vector((0, 0, mid_z)) - Vector(loc)
    o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(o)


area("key", (-2.2, -3.0, mid_z + 2.0), 260, 3)
area("fill", (2.6, -2.2, mid_z + 0.6), 70, 3)
area("rim", (0.5, 3.0, mid_z + 1.5), 160, 2)

scene.render.filepath = out + ".png"
bpy.ops.render.render(write_still=True)

# Overlays.
fwd = (cam.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()


def px(p):
    c = world_to_camera_view(scene, cam, p)
    return (round(c.x * W, 1), round((1 - c.y) * H, 1))


def loop_paths(loop):
    c = sum(loop, Vector()) / len(loop)
    front = [(p - c).dot(fwd) < 0 for p in loop]
    paths = {"front": "", "back": ""}
    n = len(loop)
    for i in range(n):
        a, b = loop[i], loop[(i + 1) % n]
        key = "front" if front[i] and front[(i + 1) % n] else "back"
        (x1, y1), (x2, y2) = px(a), px(b)
        paths[key] += f"M{x1} {y1}L{x2} {y2}"
    return paths


def line(a, b, tick=0.03):
    (x1, y1), (x2, y2) = px(a), px(b)
    dx, dy = x2 - x1, y2 - y1
    ln = math.hypot(dx, dy) or 1
    nx, ny = -dy / ln * tick * W, dx / ln * tick * W
    d = f"M{x1} {y1}L{x2} {y2}"
    for x, y in ((x1, y1), (x2, y2)):
        d += f"M{round(x - nx, 1)} {round(y - ny, 1)}L{round(x + nx, 1)} {round(y + ny, 1)}"
    return {"front": d, "back": ""}


def zr(a, b):
    return bottom + height * a, bottom + height * b


rings = {
    "chest": loop_paths(torso_ring(*zr(0.66, 0.74), "max", {0})),
    "waist": loop_paths(torso_ring(*zr(0.58, 0.66), "min")),
    "hip": loop_paths(torso_ring(*zr(0.48, 0.56), "max")),
    "upperArm": loop_paths(limb_ring(3, -1, 0.55)),
    "thigh": loop_paths(limb_ring(4, 1, 0.25)),
}

# Shoulders: across the front between the outer tops of the upper arms.
sh = [verts[i] for i in range(len(verts)) if part[i] == 3]
z_sh = max(p.z for p in sh)
band = [p for p in sh if p.z > z_sh - 0.04]
left = min(band, key=lambda p: p.x)
right = max(band, key=lambda p: p.x)
y_front = min(p.y for p in verts if abs(p.z - z_sh) < 0.03 and abs(p.x) < 0.1) - 0.02
rings["shoulder"] = line(
    Vector((left.x + 0.02, y_front, z_sh)), Vector((right.x - 0.02, y_front, z_sh))
)

hip_z = bottom + height * 0.52
# Torso: down the front of the body from the shoulder top to the hip.
y_torso = min(p.y for p in verts if abs(p.x - 0.12) < 0.02 and hip_z < p.z < z_sh) - 0.02
rings["torso"] = line(Vector((0.12, y_torso, z_sh)), Vector((0.12, y_torso, hip_z)))

with open(out + ".json", "w") as f:
    json.dump({"width": W, "height": H, "marks": rings}, f)
print("WROTE", out)
