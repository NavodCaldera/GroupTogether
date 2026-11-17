# Cloth simulation

Drapes a garment on a body with Blender's cloth solver and reports how tight each size is
([`DEC-021`](../../docs/decisions.md), Phase 6). It runs offline for every garment × standard body
(Task 6.4) and on request for one buyer's own body (the Deep Fit Test, Task 6.5). The go / no-go
measurements are in [`SPIKE.md`](SPIKE.md).

```text
job JSON ──run.py──▶ garment.py (shell + rest shape) ──▶ simulate.py inside Blender, one process per size
                                                          │
          result JSON + <size>.glb ◀── strain → tension ◀─┘
```

## Run

Needs Python 3.12 with numpy and Blender 4.5 LTS. Blender (GPL) runs only as a separate process;
nothing from it is imported into the app or into `run.py`.

```sh
export BLENDER_BIN="C:/Program Files/Blender Foundation/Blender 4.5/blender.exe"
python tools/cloth-sim/run.py < job.json          # job + "out_dir"; result JSON is the last stdout line
python -m pytest tools/cloth-sim/tests -q          # fast tests; the Blender ones run when BLENDER_BIN is set
```

From Python: `run.simulate(job, out_dir, timeout_s=600)`.

Job (the CLI also takes `"out_dir"` and an optional `"timeout_s"`):

```json
{ "body": "path/to/body.glb", "cls": "top", "short": false,
  "sizes": { "M": { "chest": 102, "waist": 98, "upperArm": 36 } },
  "fabric": { "gsm": 180, "stretch_pct": 5, "weave": "Cotton jersey" },
  "motions": ["WALK", "RUN", "REACH", "SIT"] }
```

Result:

```json
{ "status": "ok", "seconds": 140.2,
  "sizes": { "M": { "tension": { "chest": 0.31, "waist": 0.1, "hip": 0.0, "upperArm": 0.6, "shoulder": 0.2 },
                    "garment": "M.glb" } } }
```

`status` is `"failed"` (with `"error"` and no sizes) only when the job cannot run: a missing or
skeleton-less body file, an unknown class or motion, a bad size name, or no Blender. A size that
explodes (a vertex more than 0.5 m from the body, or not finite), crashes or passes `timeout_s`
reads tension 1.0 in every area with `"note": "unstable"` and `"garment": null`; the other sizes
still return.

## How it works

1. [`garment.py`](garment.py) (numpy): the body parts the class covers (as the browser's drape,
   [`drape.ts`](../../src/lib/fit/drape.ts) `COVER`) are cut from the body file and pushed out
   along the normals by each area's room from the chart (at least 1 cm, at most 6 cm). The shell's
   own girths are measured, and `rest_scale` per area = chart ÷ shell girth. The `rest` shape is
   the shell taken in (or let out) round the body by that scale: round the vertical axis for the
   torso, round the bone for sleeves and legs. Lengths keep; the shoulder yoke keeps its size so
   the garment hangs from the shoulders.
2. [`pose.py`](pose.py): the app's clips ([`motion.ts`](../../src/lib/fit/motion.ts), copied;
   a test checks they agree) and linear blend skinning on the body file's 36 bones.
3. [`run.py`](run.py): a timeline of 30 settle frames, then per motion 12 frames easing in from
   the rest pose, 40 frames of the clip (25 fps) and 12 frames easing out. The body and the
   skinned garment are posed for every frame and handed to Blender.
4. [`simulate.py`](simulate.py) (inside Blender): the body is a one-sided collider animated by a
   shape key per frame; the garment is cloth whose springs take their rest lengths from the
   `rest` shape key, so a tight size is in tension from the start and pushes on the body. The
   neckline (waistband for bottoms) is pinned to the skinned garment; every other vertex is pulled
   lightly (goal 0.2) towards it, so cloth caught between the arm and the torso cannot creep.
   Self-collision is off. Fabric: [`fabric.py`](fabric.py).
5. Strain per vertex = the mean of its edges' (length ÷ rest length − 1). Tension per area = the
   95th percentile over the area's vertices and every frame from the settled one on, divided by
   `stretch_pct / 100 + 0.05`, clamped to 0–1.
6. `<size>.glb` is the settled garment (the last frame before the first motion) in the body file's
   axes, with `_REGION_ID` (0 chest … 5 shoulder, 255 neutral), `JOINTS_0`, `WEIGHTS_0` and the
   same 36-bone skeleton as the body, so the viewer binds it to the body and plays the clips.

Sizes run in parallel, one Blender process (8 threads) per size, as many as the cores allow.

## Known limits

- The shell is the body's skin offset outwards, so a sleeve has no slack under the arm. Motions
  that fold the arm against the torso (WALK lowers the arms 35°) stretch the underarm, and the
  upper arm and shoulder read tight in every size. See [`SPIKE.md`](SPIKE.md).
- Tension is not calibrated against wear trials; the 0.05 added to the stretch capacity is the
  plan's rule, not a measured value.

## Batch: every garment on every standard shape (Task 6.4)

```sh
npx tsx --conditions=react-server tools/cloth-sim/export.ts out/drapes-export.json   # [--product ID | --title "Title"]
python tools/cloth-sim/batch.py out/drapes-export.json out/drapes --parallel 2        # resumable
npx tsx --conditions=react-server tools/fit-simulation/load.ts --drapes out/drapes
```

1. [`export.ts`](export.ts) writes every product with an approved size chart as a `run.simulate`
   job (no `body`), its `fitDataHash` ([`deep-fit-jobs.ts`](../../src/server/deep-fit-jobs.ts))
   and the gender of its audience (null: all shapes; children's products are left out), plus
   every standard shape that has a body file, as a path under `public/`.
2. [`batch.py`](batch.py) runs one size per Blender process (8 threads), `--parallel` at once
   (default 2, for 16 cores), on every shape of the product's gender. Each finished size is
   `OUT/<product>/<shape>/<size>.json` (+ `<size>.glb`); a rerun skips sizes already there for the
   same `fitDataHash` and body file, so a stopped batch resumes. A job that cannot run is reported
   and tried again next time; an unstable size is kept with no garment. `OUT/manifest.json` lists
   every finished size.
3. `load.ts --drapes` copies each garment to `public/fit-assets/drapes/<shape>-<size>-<hash>.glb`
   and, per product in one transaction, writes the simulated tensions over the shapes'
   `GarmentRegionTension` rows (`note` "simulated") and a `ClusterDrape` row per size. A product
   whose fit data changed since the export is skipped; an unstable size keeps its old tensions.
   Saving changed fit data deletes the product's `ClusterDrape` rows, and the product page only
   shows drapes whose hash matches the product's fit data now.

The product page then draws a buyer's standard shape wearing the simulated garment of the chosen
size (`FitView.body.garments`) when the buyer has no confirmed own body.

Run time, estimated from [`SPIKE.md`](SPIKE.md) (not yet measured on a batch): one size end to
end took 58–146 s unloaded for WALK and REACH (158 frames); the export asks for all four motions
(286 frames), so about 105–265 s, call it 3 min. With `--parallel 2` that is about 1.5 min per
size: a garment with 4 sizes on its 10 shapes (40 sizes) about an hour, the 10 approved seed
garments (400 sizes) about 10 hours (6–15 h).
