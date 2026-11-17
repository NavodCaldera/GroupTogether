"""Cloth-simulates every garment on every standard shape, offline (DEC-021, Task 6.4).

    python tools/cloth-sim/batch.py EXPORT.json OUT_DIR [--parallel 2] [--timeout 600]

EXPORT.json comes from `tools/cloth-sim/export.ts`: products (each a run.simulate job without
"body", its fitDataHash and the shapes' gender) and the standard shapes' body files. Each product
is simulated on every shape of its gender (all shapes when the gender is null), one size per
Blender process (8 threads), `--parallel` processes at once.

OUT_DIR/<product>/<shape>/<size>.json holds each finished size and <size>.glb its garment. A rerun
skips every size already there for the same fit data and body file, so a stopped batch resumes.
OUT_DIR/manifest.json lists every finished size; `load.ts --drapes OUT_DIR` loads it.
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import run  # noqa: E402

SAFE = run.SIZE_NAME


def units(export: dict) -> list[dict]:
    """(product, shape, size) to simulate, in a stable order."""
    out = []
    for p in export["products"]:
        shapes = [a for a in export["archetypes"] if p.get("gender") in (None, a["gender"])]
        for a in shapes:
            for size, chart in p["job"]["sizes"].items():
                out.append({"product": p, "shape": a, "size": size, "chart": chart})
    return out


def _dir(out: Path, u: dict) -> Path:
    return out / u["product"]["id"] / u["shape"]["name"]


def _done(out: Path, u: dict) -> dict | None:
    """The finished result of this unit for the same fit data and body file, else None."""
    f = _dir(out, u) / f"{u['size']}.json"
    try:
        r = json.loads(f.read_text("utf-8"))
    except (OSError, ValueError):
        return None
    same = r.get("fitDataHash") == u["product"]["fitDataHash"] and r.get("body") == u["shape"]["body"]
    if not same:
        return None
    if r.get("garment") and not (_dir(out, u) / r["garment"]).is_file():
        return None
    return r


def _simulate(out: Path, u: dict, timeout_s: int) -> dict:
    d = _dir(out, u)
    job = {**u["product"]["job"], "body": u["shape"]["body"], "sizes": {u["size"]: u["chart"]}}
    res = run.simulate(job, str(d), timeout_s)
    if res.get("status") != "ok" or u["size"] not in res.get("sizes", {}):
        raise RuntimeError(res.get("error") or "no result")
    s = res["sizes"][u["size"]]
    if s.get("failed"):  # Blender timed out or crashed: not written, so a rerun tries it again
        raise RuntimeError(s.get("note", "failed") + (f": {s['error']}" if s.get("error") else ""))
    r = {"fitDataHash": u["product"]["fitDataHash"], "body": u["shape"]["body"],
         "tension": s.get("tension", {}), "garment": s.get("garment"),
         "seconds": s.get("seconds", res.get("seconds"))}
    if s.get("note"):
        r["note"] = s["note"]
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / f"{u['size']}.json.tmp"
    tmp.write_text(json.dumps(r), "utf-8")
    tmp.replace(d / f"{u['size']}.json")  # written last: a size is done only once this exists
    return r


def manifest(out: Path, export: dict, todo: list[dict]) -> dict:
    products = []
    for p in export["products"]:
        drapes = []
        for u in todo:
            if u["product"] is not p:
                continue
            r = _done(out, u)
            if r is None:
                continue
            g = r.get("garment")
            drapes.append({"archetype": u["shape"]["name"], "size": u["size"],
                           "tension": r["tension"],
                           "garment": f"{p['id']}/{u['shape']['name']}/{g}" if g else None,
                           **({"note": r["note"]} if r.get("note") else {})})
        products.append({"id": p["id"], "fitDataHash": p["fitDataHash"], "drapes": drapes})
    return {"products": products}


def batch(export: dict, out_dir: str, parallel: int = 2, timeout_s: int = 600,
          log=print) -> dict:
    """Simulates what is not done yet, writes manifest.json and returns a summary."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    todo = units(export)
    bad = [u for u in todo if not SAFE.match(u["size"])]
    if bad:
        raise ValueError(f"bad size names {sorted({u['size'] for u in bad})}")
    pending = [u for u in todo if _done(out, u) is None]
    log(f"{len(todo)} sizes, {len(todo) - len(pending)} done already, {len(pending)} to simulate")
    started = time.monotonic()
    failed: list[str] = []
    lock = threading.Lock()

    def one(u: dict) -> None:
        name = f"{u['product']['id']}/{u['shape']['name']}/{u['size']}"
        try:
            r = _simulate(out, u, timeout_s)
            log(f"{name}: {r.get('seconds')} s{' (' + r['note'] + ')' if r.get('note') else ''}")
        except Exception as e:  # noqa: BLE001 - one failed size must not stop the batch
            with lock:
                failed.append(name)
            log(f"{name}: failed: {e}")

    with ThreadPoolExecutor(max(1, parallel)) as pool:
        list(pool.map(one, pending))
    m = manifest(out, export, todo)
    (out / "manifest.json").write_text(json.dumps(m, indent=2), "utf-8")
    return {"sizes": len(todo), "simulated": len(pending) - len(failed), "failed": failed,
            "seconds": round(time.monotonic() - started, 1)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("export")
    ap.add_argument("out_dir")
    ap.add_argument("--parallel", type=int, default=2, help="Blender processes at once (8 threads each)")
    ap.add_argument("--timeout", type=int, default=600, help="seconds per size")
    a = ap.parse_args()
    export = json.loads(Path(a.export).read_text("utf-8"))
    summary = batch(export, a.out_dir, a.parallel, a.timeout)
    print(json.dumps(summary), flush=True)
    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
