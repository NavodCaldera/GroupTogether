"""The standard body shapes as Anny body files with a skeleton (DEC-021).

    python tools/fit-simulation/anny_bodies.py public/fit-assets/bodies [archetypes.json]

Each archetype's height, chest, waist and hip (archetypes.py) are fitted with the same model as a
buyer's own body (tools/body-fitting), so every body in the viewer looks and moves alike. Writes
`<name>-<hash>.glb` per shape and `bodies.json` (name -> file), which `load.ts` `loadBodyFiles`
and the seed read. File names carry a content hash: the same input gives the same names, and the
files can be cached for ever.

Needs the body-fitting environment (Anny); the rest of this folder needs only numpy.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "body-fitting"))

from archetypes import load  # noqa: E402

GIRTHS = ("chest", "waist", "hip")


def build(out_dir: str, archetypes_path: str | None = None, fitter=None) -> dict[str, str]:
    from fit import Fitter, write_body

    fitter = fitter or Fitter()
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    files: dict[str, str] = {}
    for a in load(archetypes_path):
        p = a["params"]
        result = fitter.fit_measurements(p["height"], 1 if a["gender"] == "WOMEN" else 0,
                                         {k: p[k] for k in GIRTHS})
        if result["status"] != "ok":
            raise RuntimeError(f"{a['name']}: no body matches {result['quality']}")
        tmp = out / f"{a['name']}.tmp"
        write_body(fitter, result, str(tmp))
        name = f"{a['name']}-{hashlib.sha256(tmp.read_bytes()).hexdigest()[:10]}.glb"
        tmp.replace(out / name)
        files[a["name"]] = name
    for old in out.glob("*.glb"):
        if old.name not in files.values():
            old.unlink()
    (out / "bodies.json").write_text(json.dumps(files, indent=2) + "\n", "utf-8")
    return files


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
    with contextlib.redirect_stdout(sys.stderr):  # Anny's Warp banner
        made = build(*sys.argv[1:])
    print(json.dumps(made, indent=2))
