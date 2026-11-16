"""The body file's skeleton (DEC-021): Anny's 104 bones folded onto the 36 that move a body.

The browser plays walk, run, reach and sit on these bones (src/lib/fit/motion.ts, same names in
the same order), for the buyer's own body and the standard ones alike.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "fit-simulation"))
from gltf import Skin  # noqa: E402

BONES = (
    "root",
    "pelvis.L", "upperleg01.L", "upperleg02.L", "lowerleg01.L", "lowerleg02.L", "foot.L",
    "pelvis.R", "upperleg01.R", "upperleg02.R", "lowerleg01.R", "lowerleg02.R", "foot.R",
    "spine05", "spine04", "spine03", "spine02", "spine01",
    "clavicle.L", "shoulder01.L", "upperarm01.L", "upperarm02.L", "lowerarm01.L", "lowerarm02.L",
    "wrist.L",
    "clavicle.R", "shoulder01.R", "upperarm01.R", "upperarm02.R", "lowerarm01.R", "lowerarm02.R",
    "wrist.R",
    "neck01", "neck02", "neck03", "head",
)  # fmt: skip


def to_file_axes(points: np.ndarray, floor: float) -> np.ndarray:
    """Anny (Z up, facing -Y) to the body file (Y up, facing +Z, feet at y = 0)."""
    p = points[:, [0, 2, 1]] * np.array([1.0, 1.0, -1.0])
    p[:, 1] -= floor
    return p


def skin_for(body, heads: np.ndarray, floor: float = 0.0) -> Skin:
    """`heads` (104, 3) as Anny gives them; `floor` is the lowest body point (Anny z)."""
    labels = list(body.model.bone_labels)
    parents = [int(p) for p in body.model.bone_parents]
    kept = {name: i for i, name in enumerate(BONES)}
    missing = [n for n in BONES if n not in labels]
    if missing:
        raise RuntimeError(f"Anny is missing bones {missing}")

    def fold(i: int) -> int:  # nearest kept ancestor: fingers to the wrist, face to the head
        while labels[i] not in kept:
            i = parents[i]
        return kept[labels[i]]

    target = np.array([fold(i) for i in range(len(labels))])
    idx = body.model.vertex_bone_indices.numpy()
    w = body.model.vertex_bone_weights.numpy()
    dense = np.zeros((len(idx), len(BONES)))
    rows = np.repeat(np.arange(len(idx)), idx.shape[1])
    np.add.at(dense, (rows, target[idx].reshape(-1)), w.reshape(-1))
    joints = np.argsort(-dense, axis=1)[:, :4]
    weights = np.take_along_axis(dense, joints, axis=1)
    weights /= weights.sum(axis=1, keepdims=True)
    joints[weights == 0] = 0
    source = [labels.index(n) for n in BONES]
    return Skin(
        names=list(BONES),
        parents=[-1 if parents[i] < 0 else fold(parents[i]) for i in source],
        heads=to_file_axes(heads[source], floor).astype(np.float32),
        joints=joints.astype(np.uint8),
        weights=weights.astype(np.float32),
    )
