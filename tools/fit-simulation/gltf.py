"""Minimal binary glTF 2.0 (.glb) writer for animated fit meshes (DEC-020).

Each mesh has POSITION (NORMAL optional; the viewer computes it), optional _REGION_ID (float scalar; 0-6 an area, 255 neutral)
and morph targets; one animation drives every mesh's morph weights. Draco compression is a
separate step (README: `gltf-transform draco`), so this file needs only numpy.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field

import numpy as np

FLOAT, UINT8, UINT16, UINT32 = 5126, 5121, 5123, 5125
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


@dataclass
class Skin:
    """A skeleton and each vertex's four bones. Bones are translation-only nodes at their heads."""

    names: list[str]
    parents: list[int]  # index into names, -1 for a root; parents come before children
    heads: np.ndarray  # (bones, 3) float32, the mesh's axes, metres
    joints: np.ndarray  # (n, 4) uint8
    weights: np.ndarray  # (n, 4) float32, rows sum to 1


@dataclass
class Mesh:
    name: str
    positions: np.ndarray  # (n, 3) float32, metres
    indices: np.ndarray  # (m,) uint32, triangles
    region_ids: np.ndarray | None = None  # (n,) float32
    targets: list[np.ndarray] = field(default_factory=list)  # (n, 3) displacements
    colour: tuple[float, float, float, float] = (0.85, 0.83, 0.8, 1.0)
    # Extra float scalar vertex attributes, e.g. {"_BODY_PART": ...}; names start with "_".
    extra: dict[str, np.ndarray] = field(default_factory=dict)
    skin: Skin | None = None


def normals(positions: np.ndarray, indices: np.ndarray) -> np.ndarray:
    tri = indices.reshape(-1, 3)
    a, b, c = positions[tri[:, 0]], positions[tri[:, 1]], positions[tri[:, 2]]
    face = np.cross(b - a, c - a)
    out = np.zeros_like(positions)
    for k in range(3):
        np.add.at(out, tri[:, k], face)
    length = np.linalg.norm(out, axis=1, keepdims=True)
    return (out / np.where(length == 0, 1, length)).astype(np.float32)


class _Builder:
    def __init__(self) -> None:
        self.blob = bytearray()
        self.views: list[dict] = []
        self.accessors: list[dict] = []

    def add(self, data: np.ndarray, kind: str, component: int, target: int | None = None,
            minmax: bool = False) -> int:
        while len(self.blob) % 4:
            self.blob.append(0)
        raw = data.tobytes()
        view = {"buffer": 0, "byteOffset": len(self.blob), "byteLength": len(raw)}
        if target:
            view["target"] = target
        self.blob += raw
        self.views.append(view)
        acc = {
            "bufferView": len(self.views) - 1,
            "componentType": component,
            "count": int(data.shape[0]),
            "type": kind,
        }
        if minmax:
            flat = data.reshape(data.shape[0], -1)
            acc["min"] = [float(v) for v in flat.min(axis=0)]
            acc["max"] = [float(v) for v in flat.max(axis=0)]
        self.accessors.append(acc)
        return len(self.accessors) - 1


def write_glb(path: str, meshes: list[Mesh], times: np.ndarray, weights: np.ndarray,
              clip: str, with_normals: bool = False, extras: dict | None = None) -> None:
    """`weights` is (len(times), targets): every mesh has the same number of targets."""
    b = _Builder()
    gl_meshes, nodes, materials = [], [], []
    skins, bone_nodes, roots = [], [], []
    first_bone = len(meshes)
    for i, m in enumerate(meshes):
        pos = m.positions.astype(np.float32)
        # Normals are left out to keep files small; the viewer computes them.
        attrs = {"POSITION": b.add(pos, "VEC3", FLOAT, ARRAY_BUFFER, minmax=True)}
        if with_normals:
            attrs["NORMAL"] = b.add(normals(pos, m.indices), "VEC3", FLOAT, ARRAY_BUFFER)
        if m.region_ids is not None:
            attrs["_REGION_ID"] = b.add(m.region_ids.astype(np.float32), "SCALAR", FLOAT,
                                        ARRAY_BUFFER)
        for name, values in m.extra.items():
            attrs[name] = b.add(values.astype(np.float32), "SCALAR", FLOAT, ARRAY_BUFFER)
        if m.skin is not None:
            attrs["JOINTS_0"] = b.add(m.skin.joints.astype(np.uint8), "VEC4", UINT8, ARRAY_BUFFER)
            attrs["WEIGHTS_0"] = b.add(m.skin.weights.astype(np.float32), "VEC4", FLOAT,
                                       ARRAY_BUFFER)
        targets = [{"POSITION": b.add(t.astype(np.float32), "VEC3", FLOAT, ARRAY_BUFFER,
                                      minmax=True)} for t in m.targets]
        small = len(pos) < 65536
        index = b.add(m.indices.astype(np.uint16 if small else np.uint32), "SCALAR",
                      UINT16 if small else UINT32, ELEMENT_ARRAY_BUFFER)
        materials.append({"name": m.name, "pbrMetallicRoughness": {
            "baseColorFactor": list(m.colour), "metallicFactor": 0, "roughnessFactor": 0.9},
            "doubleSided": True})
        prim = {"attributes": attrs, "indices": index, "material": i}
        if targets:
            prim["targets"] = targets
        gl_meshes.append({"name": m.name, "primitives": [prim],
                          **({"weights": [0.0] * len(targets)} if targets else {})})
        node = {"name": m.name, "mesh": i}
        if m.skin is not None:
            node["skin"] = len(skins)
            base = first_bone + len(bone_nodes)
            heads = m.skin.heads.astype(np.float64)
            inverse = np.tile(np.eye(4, dtype=np.float32), (len(heads), 1, 1))
            inverse[:, 3, :3] = -heads  # column-major: the translation is the last column
            for j, (name, parent) in enumerate(zip(m.skin.names, m.skin.parents)):
                offset = heads[j] - (heads[parent] if parent >= 0 else 0)
                bone = {"name": name, "translation": [float(v) for v in offset]}
                kids = [base + k for k, q in enumerate(m.skin.parents) if q == j]
                if kids:
                    bone["children"] = kids
                if parent < 0:
                    roots.append(base + j)
                bone_nodes.append(bone)
            skins.append({"joints": [base + j for j in range(len(heads))],
                          "inverseBindMatrices": b.add(inverse, "MAT4", FLOAT)})
        nodes.append(node)

    animations = []
    if weights.size:
        t_acc = b.add(times.astype(np.float32), "SCALAR", FLOAT, minmax=True)
        w_acc = b.add(weights.astype(np.float32).reshape(-1), "SCALAR", FLOAT)
        animations.append({
            "name": clip,
            "samplers": [{"input": t_acc, "output": w_acc, "interpolation": "LINEAR"}],
            "channels": [{"sampler": 0, "target": {"node": i, "path": "weights"}}
                         for i, m in enumerate(meshes) if m.targets],
        })

    asset = {"version": "2.0", "generator": "groupbasket fit-simulation"}
    if extras:
        asset["extras"] = extras
    doc = {
        "asset": asset,
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes))) + roots}],
        "nodes": nodes + bone_nodes,
        "meshes": gl_meshes,
        "materials": materials,
        "accessors": b.accessors,
        "bufferViews": b.views,
        "buffers": [{"byteLength": len(b.blob)}],
        "animations": animations,
    }
    if skins:
        doc["skins"] = skins
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    bin_ = bytes(b.blob) + b"\0" * (-len(b.blob) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(bin_), 0x004E4942) + bin_)
