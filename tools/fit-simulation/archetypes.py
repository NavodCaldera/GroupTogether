"""Body archetypes the simulation runs on (DEC-020, DEC-021).

The standard shapes are the 20 body clusters in `seed/clusters.json` (10 men, 10 women), made
by `clusters.py` from sampled Anny bodies. Each carries its measurements (cm, in the app's area
keys, src/lib/fit/regions.ts, plus height) and the Anny phenotype that builds its body file
(`anny_bodies.py`). Research-licensed body models are never used here
(`scripts/check-licences.mjs`). Once enough buyers are measured, the clusters can be made from
their stored measurements instead.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

CLUSTERS = Path(__file__).resolve().parent / "seed" / "clusters.json"


def load(path: str | None) -> list[dict]:
    """Archetypes from a JSON file, or the seed clusters."""
    return json.loads(Path(path or CLUSTERS).read_text(encoding="utf-8"))


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("archetypes.json")
    data = load(None)
    out.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {len(data)} archetypes to {out}")
