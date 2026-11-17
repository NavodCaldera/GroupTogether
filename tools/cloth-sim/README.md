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
explodes (a vertex more than 0.5 m from the body, or not finite) reads tension 1.0 in every area
with `"note": "unstable"` and `"garment": null`. A size whose Blender crashes or passes
`timeout_s` has no tension: `"failed": true`, `"note": "crash"` or `"timeout"` (a busy machine
says nothing about the garment). The other sizes still return.

## How it works

1. [`garment.py`](garment.py) (numpy): the body parts the class covers (as the browser's drape,
   [`drape.ts`](../../src/lib/fit/drape.ts) `COVER`) are cut from the body file and pushed out
   along the normals by each area's room from the chart (at least 1 cm, at most 6 cm). Room is
   the chart's girth minus the body's, taped as a size chart means it: the waist at its narrowest
   and the hip at its widest row (by front width) between the shoulder and hip joints, in the bands
   of [`bands.py`](../body-fitting/bands.py) that the buyer's measuring and the standard bodies
   use; the thigh at its fullest slice; chest and upper arm through the middle of their parts.
   The shell's own girths are taped the same way on the garment alone (a top's hem stops above
   the seat, where the body's hip may be widest), and `rest_scale` per area = chart ÷ shell girth. The `rest` shape is
   the shell taken in (or let out) round the body by that scale: round the vertical axis for the
   torso, round the bone for sleeves and legs, then let out by the simulation's collision offset
   (0.9 cm, so a chart equal to the body reads as touching). Lengths keep; the shoulder yoke keeps
   its size so the garment hangs from the shoulders. A top without a hip in its chart has its hem
   (the hip area) held at the chart's waist. `drape` is where the cloth sits standing: `rest`,
   kept at least 1 cm off the skin (a tight size lies on the skin, a loose one hangs at its size).
2. [`pose.py`](pose.py): the app's clips ([`motion.ts`](../../src/lib/fit/motion.ts), copied;
   a test checks they agree) and linear blend skinning on the body file's 36 bones.
3. [`run.py`](run.py): a timeline of 30 settle frames, then per motion 12 frames easing in from
   the rest pose, 40 frames of the clip (25 fps) and 12 frames easing out. The body and the
   `drape` are skinned to every frame and handed to Blender. Skinning carries torso cloth with
   the torso and sleeve cloth with the arm, so where an arm swings down against the side (WALK,
   RUN, SIT) the skinned drape would lie inside the arm (or a sleeve inside the torso):
   `clear_of_limbs` moves each such drape vertex out to 1 cm off the other part, by as much more
   as it is inside than it was standing (the rest pose is unchanged). Torso cloth goes out of each
   arm segment (upper arm, forearm, hand, each taken as a tube round its own axis) always on the
   torso's side, between the arm and the side; whatever is still inside a part that does not
   carry it (the armpit, sleeves against the torso) goes out along that part's nearest skin
   normal. A loose size stands 5–7 cm off the skin, past the middle of a lowered arm: pushed by
   the nearest skin normal alone, some of that cloth went out the arm's far side and its
   neighbours the near side, so the arm cut through the cloth and stretched the edges across it
   to several times their length (the Oxford shirt's XL read chest 1.0 on men-01, its L 0.19).
4. [`simulate.py`](simulate.py) (inside Blender): the body is a one-sided collider animated by a
   shape key per frame; the garment is cloth whose springs take their rest lengths from the
   `rest` shape key, so a tight size is in tension from the start and pushes on the body. The
   neckline (waistband for bottoms) is pinned to the skinned drape (pin stiffness 30); every other
   vertex is pulled towards it with goal 0.5, and the skin's friction is low (0.5), so cloth that
   an arm drags along returns instead of staying wound up. Self-collision is off. Fabric:
   [`fabric.py`](fabric.py).
5. **Strain** per vertex = the mean of its edges' (length ÷ reference − 1), where an edge's
   reference is its rest length, stretched as far as the skin under it stretches in that frame
   (the drape carried by the skin alone): only the strain the cloth adds beyond the body's own
   surface counts. Read from the settled frame on, leaving out the rim of each opening (neck, hem,
   cuffs: too few edges) and, per frame, cloth within 2.5 cm of both an arm and the torso, or of
   both legs (squeezed between two colliding body surfaces, not stretched by its size).
6. **Tension** per area, 0 slack to 1 tight, is the higher of
   - the tight side: the 95th percentile of that strain over the area's vertices and frames,
     ÷ `stretch_pct / 100 + 0.05`, clamped to 0–1;
   - the slack side: `0.6 × exp(−room / looseAt)`, room = chart girth − the body's girth at that
     area (cm, floored at 0), with the app's `snugFrom` (0.6) and per-type `looseAt`
     ([`config.ts`](../../src/lib/fit/config.ts) `EASE`; a test keeps them equal). Unstretched
     cloth has zero strain however loose it is, so this side says how much room it has: none reads
     snug (0.6), the app's loose distance reads 0.22. Shoulder and lengths have no slack side.
7. `<size>.glb` is the settled garment (the last frame before the first motion) in the body file's
   axes, with `_REGION_ID` (0 chest … 5 shoulder, 255 neutral), `JOINTS_0`, `WEIGHTS_0` and the
   same 36-bone skeleton as the body, so the viewer binds it to the body and plays the clips.

Sizes run in parallel, one Blender process (8 threads) per size, as many as the cores allow.

## Known limits

- Room is measured on the body file, not taken from the shape's listed measurements. They agree
  within 2 cm or 3 % on every standard body (chest, waist, hip, upper arm, thigh; a test keeps
  them so): the listed waist and hip are cut through the mesh, the cloth simulation's are a
  2.4 cm slice of its vertices.
- A top's chart rarely gives a hip, so its hem is held at the chart's waist and its hip room is
  that against the body's widest hip, which on a full seat sits below the hem: a tee's hip can
  read tighter than the cloth at its hem.

- The shell is the body's skin offset outwards: no seams, no extra cloth under the arm. The strain
  read from it leaves the squeezed underarm out rather than modelling a gusset.
- On full bodies whose lowered arms lie against the sides (men-08, men-03), sleeve cloth under
  the arm is squeezed 2.5–5 cm from the torso, just past the pinch distance, while the arms are
  down (WALK, RUN, SIT): the upper arm reads tight even with 7 cm of room (Oxford shirt XL on
  men-08: 1.0, with almost no strain standing).
- The tight side reads the mean of each vertex's edges, so a tight girth (stretched round, not
  along) reads lower than its circumferential stretch: Dilan in two sizes small is stretched 11 %
  round the chest and reads 0.885.
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
   same `fitDataHash` and body file, so a stopped batch resumes. A job that cannot run, or a size
   whose Blender crashed or timed out, is reported, not written, and tried again next time; an
   unstable size is kept with no garment. `OUT/manifest.json` lists
   every finished size.
3. `load.ts --drapes` copies each garment to `public/fit-assets/drapes/<shape>-<size>-<hash>.glb`
   and, per product in one transaction, writes the simulated tensions over the shapes'
   `GarmentRegionTension` rows (`note` "simulated") and a `ClusterDrape` row per size. A product
   whose fit data changed since the export is skipped; an unstable size keeps its old tensions.
   Saving changed fit data deletes the product's `ClusterDrape` rows, and the product page only
   shows drapes whose hash matches the product's fit data now.

The product page then draws a buyer's standard shape wearing the simulated garment of the chosen
size (`FitView.body.garments`) when the buyer has no confirmed own body.

Run time, measured on the crew tee batch (10 men shapes × 4 sizes, all four motions, 286
frames, `--parallel 2`, 2026-11-17, other agents' work running alongside): 116–410 s per size
end to end per process, mean 252 s (the looser and the smaller bodies are faster, men-05 and
men-08 slowest); the 40 sizes took 86 min, about 2.1 min per size with two at once. The 10
approved seed garments (400 sizes) would take about 14 hours on a loaded machine. Unloaded, one
size took 100–125 s (two at once).
