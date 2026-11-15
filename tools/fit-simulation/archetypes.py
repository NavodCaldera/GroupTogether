"""Body archetypes the simulation runs on (DEC-020).

Production bodies must come from commercially safe sources: our own measurement-driven
generator (this file) or MakeHuman (AGPL) run as an isolated build step. SMPL/SMPL-X are
research-licensed and never used here.

The seed set has 4 archetypes (2 men, 2 women); the target is 30-50 covering Sri Lankan
adult shapes, sampled
from measured buyer profiles once enough exist (cluster the stored measurements, take each
cluster centre). Measurements are cm and use the app's area keys (src/lib/fit/regions.ts).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SEED_ARCHETYPES = [
    {
        "name": "men-slim-168",
        "gender": "MEN",
        "params": {
            "height": 168, "chest": 90, "waist": 78, "hip": 91, "thigh": 51, "upperArm": 28,
            "shoulder": 42, "torso": 50, "neck": 36, "wrist": 16.5, "inseam": 76,
        },
    },
    {
        "name": "men-broad-174",
        "gender": "MEN",
        "params": {
            "height": 174, "chest": 104, "waist": 94, "hip": 102, "thigh": 58, "upperArm": 33,
            "shoulder": 46, "torso": 52, "neck": 40, "wrist": 18, "inseam": 79,
        },
    },
    {
        "name": "women-petite-155",
        "gender": "WOMEN",
        "params": {
            "height": 155, "chest": 84, "waist": 70, "hip": 92, "thigh": 52, "upperArm": 26,
            "shoulder": 37, "torso": 44, "neck": 32, "wrist": 14.5, "inseam": 70,
        },
    },
    {
        "name": "women-curvy-162",
        "gender": "WOMEN",
        "params": {
            "height": 162, "chest": 98, "waist": 84, "hip": 106, "thigh": 60, "upperArm": 31,
            "shoulder": 40, "torso": 46, "neck": 34, "wrist": 15.5, "inseam": 73,
        },
    },
]


def load(path: str | None) -> list[dict]:
    """Archetypes from a JSON file, or the seed set."""
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    return SEED_ARCHETYPES


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("archetypes.json")
    out.write_text(json.dumps(SEED_ARCHETYPES, indent=2), encoding="utf-8")
    print(f"Wrote {len(SEED_ARCHETYPES)} archetypes to {out}")
