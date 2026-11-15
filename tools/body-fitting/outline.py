"""Read the phone's outlines and joints into the same features `body.Features` measures.

Input per view (front, side), as the phone sends it (photos never leave the phone, `DEC-021`):

    {"width": W, "height": H, "spans": [[y, left, right], ...], "landmarks": [[x, y, visibility], ...]}

`spans` is the downsampled body outline as runs of body pixels (inclusive), `landmarks` the 33
MediaPipe pose landmarks in the same pixels. This mirrors
`src/components/fit/capture/measure/{estimate,silhouette}.ts`, except a row only counts when its
middle point is body (no nearest-run search), so a gap between the legs reads as missing.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from body import BANDS

L_SHOULDER, R_SHOULDER, L_HIP, R_HIP = 11, 12, 23, 24


@dataclass
class View:
    mask: np.ndarray  # (H, W) uint8, 1 = body
    landmarks: np.ndarray  # (33, 3) x, y, visibility

    @staticmethod
    def from_json(d: dict) -> "View":
        w, h = int(d["width"]), int(d["height"])
        if not (0 < w <= 2048 and 0 < h <= 2048):
            raise ValueError("outline size out of range")
        mask = np.zeros((h, w), dtype=np.uint8)
        for y, left, right in d["spans"]:
            y, left, right = int(y), max(0, int(left)), min(w - 1, int(right))
            if 0 <= y < h and left <= right:
                mask[y, left : right + 1] = 1
        lm = np.asarray(d["landmarks"], dtype=float)
        if lm.shape != (33, 3):
            raise ValueError("expected 33 landmarks")
        return View(mask, lm)


def mask_to_spans(mask: np.ndarray) -> list[list[int]]:
    """Runs of body pixels per row: the phone's outline format."""
    spans = []
    for y in range(mask.shape[0]):
        row = np.concatenate([[0], mask[y].astype(np.int8), [0]])
        d = np.diff(row)
        for a, b in zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1) - 1):
            spans.append([y, int(a), int(b)])
    return spans


@dataclass
class Observed:
    """Features read from the photos, cm. NaN where a row can't be read."""

    torso: float
    leg: float
    shoulder_joints: float
    hip_joints: float
    width: np.ndarray
    depth: np.ndarray


class _Frame:
    def __init__(self, view: View, height_cm: float):
        rows = np.flatnonzero(view.mask.any(axis=1))
        if not len(rows):
            raise ValueError("empty outline")
        self.top, self.bottom = int(rows[0]), int(rows[-1])
        self.cm = height_cm / (self.bottom - self.top + 1)
        lm = view.landmarks
        if min(lm[i, 2] for i in (L_SHOULDER, R_SHOULDER, L_HIP, R_HIP)) < 0.5:
            raise ValueError("shoulders or hips not visible")
        self.shoulder = (lm[L_SHOULDER, :2] + lm[R_SHOULDER, :2]) / 2
        self.hip = (lm[L_HIP, :2] + lm[R_HIP, :2]) / 2
        self.torso_px = self.hip[1] - self.shoulder[1]
        if self.torso_px <= 0:
            raise ValueError("hips above shoulders")
        self.mask = view.mask

    def x_at(self, y: float) -> float:
        t = min(1.0, max(0.0, (y - self.shoulder[1]) / self.torso_px))
        return self.shoulder[0] + t * (self.hip[0] - self.shoulder[0])

    def _run(self, y: int, x: float) -> int:
        h, w = self.mask.shape
        cx = int(round(x))
        if not (0 <= y < h and 0 <= cx < w) or not self.mask[y, cx]:
            return 0
        row = self.mask[y]
        left = cx
        while left > 0 and row[left - 1]:
            left -= 1
        right = cx
        while right < w - 1 and row[right + 1]:
            right += 1
        return right - left + 1

    def widths(self) -> np.ndarray:
        out = []
        for t in BANDS:
            y = self.shoulder[1] + t * self.torso_px
            runs = [self._run(int(round(y)) + d, self.x_at(y)) for d in range(-2, 3)]
            runs = [r for r in runs if r > 0]
            # Median of five rows damps ragged mask edges, like smoothedSpan on the phone.
            out.append(np.median(runs) * self.cm if len(runs) >= 3 else np.nan)
        return np.array(out, dtype=float)


def observe(front: View, side: View | None, height_cm: float) -> Observed:
    f = _Frame(front, height_cm)
    lm = front.landmarks
    depth = _Frame(side, height_cm).widths() if side is not None else np.full(len(BANDS), np.nan)
    return Observed(
        torso=f.torso_px * f.cm,
        leg=(f.bottom - f.hip[1]) * f.cm,
        shoulder_joints=abs(lm[L_SHOULDER, 0] - lm[R_SHOULDER, 0]) * f.cm,
        hip_joints=abs(lm[L_HIP, 0] - lm[R_HIP, 0]) * f.cm,
        width=f.widths(),
        depth=depth,
    )
