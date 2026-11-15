# Body fitting

Fits a buyer's own 3D body ([Anny](https://github.com/naver/anny)) to what the phone sends after
the two onboarding photos ([`DEC-021`](../../docs/decisions.md)). The photos never leave the
phone: the job carries the downsampled body outlines (front and side) and the pose joints, plus the
height and any tape measurements. CPU only; no GPU, no Blender.

```text
phone: outlines + joints + height ──▶ job JSON ──fit.py──▶ Anny parameters + quality + measurements
```

## Run

Python 3.12. Install into a virtual environment (Anny downloads ~1.4 GB of model data to
`~/.cache/anny` on first use, once per machine):

```sh
python -m venv .venv && .venv/Scripts/pip install -r tools/body-fitting/requirements.txt
.venv/Scripts/python tools/body-fitting/fit.py job.json      # or: fit.py - < job.json
.venv/Scripts/python -m pytest tools/body-fitting/tests -q   # ~2 min
```

Nothing here is wired into the app yet: the job queue, worker and confirmation screen are the next
steps in the [plan](../../docs/superpowers/plans/personal-body-mesh-paused.md).

## How it fits

1. [`outline.py`](outline.py) reads the outlines like the phone's measuring code does: scale from
   the height, torso axis from the shoulder and hip joints, and the torso width (front) and depth
   (side) at 18 rows from 0.20 to 1.05 of the way from the shoulder joints to the hip joints. The
   arms are separate runs and are left out.
2. [`body.py`](body.py) measures an Anny body the same way, from exact cross-sections of its mesh
   (arms left out), plus chest, waist and hip girths (a tape around each cross-section).
3. [`fit.py`](fit.py): the height control by bisection, CMA-ES on Anny's 6 overall controls
   (gender, age, muscle, weight, height, proportions; age kept adult), then Levenberg-Marquardt
   on those plus 17 local controls (bust, underbust, waist, hips, shoulders, torso and hip
   scale, leg lengths and others). About 600–750 bodies; 13–18 s on 8 threads, ~26 s on one.
4. Quality: the outline error (RMS, cm). `failed` when it is over 1.5 cm, fewer than 12 rows
   are readable, or the height misses by more than 1.5 cm; the buyer then keeps the archetype body.

## Job and result

```jsonc
// job
{ "heightCm": 168, "gender": 1,          // gender optional: Anny's 0 = male, 1 = female
  "typed": { "waist": 74 },              // optional tape measurements (chest, waist, hip)
  "front": { "width": 256, "height": 512,
             "spans": [[y, left, right], ...],          // body pixel runs, inclusive
             "landmarks": [[x, y, visibility], ...] },  // the 33 MediaPipe pose landmarks
  "side":  { ... } }                     // optional, same shape
// result
{ "status": "ok" | "failed",
  "quality": { "rmsCm": 0.15, "rows": 36, "missingRows": 0, "heightErrorCm": 0.0,
               "pass": true, "reasons": [] },
  "phenotype": { "gender": 1.0, ... }, "local": { "measure-waist-circ-incr": 0.03, ... },
  "measurements": { "height": 168.0, "chest": 88.1, "waist": 74.2, "hip": 97.0, "torso": 44.1 },
  "evals": 757, "seconds": 18.4 }
```

A 512-pixel outline pair is about 22 KB.

## Accuracy

Tested only on **synthetic** input ([`synthetic.py`](synthetic.py)): outlines rendered from
known Anny bodies, with the joints taken from Anny's own skeleton. On those, the outline fits
to ~0.15 cm and chest, waist and hip come back within ~1 cm (hip within ~3 cm from outlines
alone; tape measurements bring it to ~0.5 cm).

Real photos will be worse until calibrated: MediaPipe's shoulder and hip landmarks sit at
different points from Anny's joints (hence the loose 2 cm joint weight in `SD`), clothing widens
the outline, and the side photo's arm can hide the back. Measure that bias with tape-measured
volunteers (the same accuracy test as
[`src/components/fit/capture/calibration.ts`](../../src/components/fit/capture/calibration.ts))
before showing anyone a fitted body as theirs.

## Licences

Anny's code is Apache 2.0 and its assets CC0; `cma` is BSD-3. Install plain `anny`, never its
extras, and never call its converters to other body models: they download NAVER's
non-commercial data. `npm run check` runs [`scripts/check-licences.mjs`](../../scripts/check-licences.mjs),
which fails on the blocked models and that download.
