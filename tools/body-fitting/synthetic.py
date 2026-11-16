"""Synthetic phone input from a known Anny body, for tests: outlines and joints, no photos.

Front view projects x-z with the arms (in Anny's rest pose they hang clear of the torso, as the
capture asks); side view projects y-z without the arms, as they hang over the torso. Landmarks are
the projected shoulder and hip joints. Real MediaPipe landmarks differ from Anny's joints by a
bias the accuracy test still has to measure (README).
"""

from __future__ import annotations

import numpy as np

from body import AnnyBody
from outline import L_HIP, L_SHOULDER, R_HIP, R_SHOULDER, mask_to_spans

IMAGE_H = 512  # the phone downsamples outlines to this height


def rasterize(pts: np.ndarray, faces: np.ndarray, w: int, h: int) -> np.ndarray:
    """Fill triangles (pixel coordinates) into a mask; a pixel is body when its centre is inside."""
    mask = np.zeros((h, w), dtype=np.uint8)
    tri = pts[faces]  # (F, 3, 2)
    lo = np.floor(tri.min(axis=1)).astype(int)
    hi = np.ceil(tri.max(axis=1)).astype(int)
    size = int((hi - lo).max()) + 1
    g = np.arange(size)
    gx, gy = np.meshgrid(g, g)
    gx, gy = gx.ravel(), gy.ravel()
    for start in range(0, len(faces), 2048):
        t = tri[start : start + 2048]
        o = lo[start : start + 2048]
        px = o[:, None, 0] + gx[None] + 0.5
        py = o[:, None, 1] + gy[None] + 0.5
        a, b, c = t[:, 0], t[:, 1], t[:, 2]

        def edge(p, q):
            return (q[:, None, 0] - p[:, None, 0]) * (py - p[:, None, 1]) - (q[:, None, 1] - p[:, None, 1]) * (px - p[:, None, 0])

        e0, e1, e2 = edge(a, b), edge(b, c), edge(c, a)
        inside = ((e0 >= 0) & (e1 >= 0) & (e2 >= 0)) | ((e0 <= 0) & (e1 <= 0) & (e2 <= 0))
        xi, yi = px[inside].astype(int), py[inside].astype(int)
        ok = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)
        mask[yi[ok], xi[ok]] = 1
    return mask


def _view(body: AnnyBody, verts, heads, axis: int, with_arms: bool) -> dict:
    keep = body.solid & (True if with_arms else ~body.arm)
    faces = body.faces[keep[body.faces].all(axis=1)]
    z_top, z_floor = verts[keep, 2].max(), verts[keep, 2].min()
    scale = 0.9 * IMAGE_H / (z_top - z_floor)  # body fills 90% of the height
    width = IMAGE_H // 2 if axis == 0 else IMAGE_H // 3
    cx = (verts[keep, axis].max() + verts[keep, axis].min()) / 2

    def px(p):
        return np.stack([(p[..., axis] - cx) * scale + width / 2, (z_top - p[..., 2]) * scale + 0.05 * IMAGE_H], -1)

    mask = rasterize(px(verts), faces, width, IMAGE_H)
    if not with_arms:
        # Without the arm triangles the chest side under the armpit is open, leaving a hole
        # between front and back; a person standing side-on has none, so fill each row.
        for y in np.flatnonzero(mask.any(axis=1)):
            cols = np.flatnonzero(mask[y])
            mask[y, cols[0] : cols[-1] + 1] = 1
    j = body.joints(heads)
    lm = np.zeros((33, 3))
    for i, k in ((L_SHOULDER, "shoulderL"), (R_SHOULDER, "shoulderR"), (L_HIP, "hipL"), (R_HIP, "hipR")):
        lm[i, :2] = px(j[k])
        lm[i, 2] = 1.0
    return {"width": width, "height": IMAGE_H, "spans": mask_to_spans(mask), "landmarks": lm.tolist()}


def make_job(body: AnnyBody, phenotype, local=None, typed: tuple[str, ...] = ()) -> tuple[dict, dict]:
    """The job the phone would send for this body, and the body's true measurements."""
    verts, heads = body.forward(np.asarray(phenotype, float), None if local is None else np.asarray(local, float))
    v, h = verts[0], heads[0]
    f = body.features(v, h)
    truth = f.measurements()
    job = {
        "heightCm": truth["height"],
        "front": _view(body, v, h, axis=0, with_arms=True),
        "side": _view(body, v, h, axis=1, with_arms=False),
        "typed": {k: truth[k] for k in typed},
    }
    return job, truth


def widened_case(body: AnnyBody, phenotype, clothing_px: int) -> dict:
    """An accuracy case for a known body whose outlines are `clothing_px` wider on each side, as
    clothes make them; `tape` is the body's true measurements. `clothingCm` records the widening.
    """
    job, truth = make_job(body, [phenotype])
    job["gender"] = round(phenotype[0])
    for view in (job["front"], job["side"]):
        w = view["width"]
        view["spans"] = [[y, max(0, a - clothing_px), min(w - 1, b + clothing_px)] for y, a, b in view["spans"]]
    rows = {y for y, _, _ in job["front"]["spans"]}
    return {"job": job, "tape": {k: truth[k] for k in ("chest", "waist", "hip")},
            "clothingCm": clothing_px * truth["height"] / len(rows)}
