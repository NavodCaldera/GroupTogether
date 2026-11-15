# Personal body mesh and Deep Fit Test (paused)

**Status:** paused by the owner on **2026-11-15**, resumed **2026-11-16** ("keep doing"). The
open questions below were not answered; work proceeds on the recommended answers until the owner
says otherwise (`DEC-021` in [decisions](../../decisions.md)).

**Progress:** step 3 (fitting service, [`tools/body-fitting`](../../../tools/body-fitting/README.md))
and step 8 (licence check, `scripts/check-licences.mjs`) built 2026-11-16, tested on synthetic
bodies only. Fitting is CMA-ES on the phenotypes then Levenberg-Marquardt on phenotypes and 17
local controls (not CMA-ES for both stages: it stopped short). Steps 1, 2 and 4 built 2026-11-16:
the phone sends 512-row outlines with the joints (`outline.ts`) when the front photo is usable;
`BodyFitJob` queue (`body-fit-jobs.ts`, `FOR UPDATE SKIP LOCKED`, 3 attempts, stale after 10 min);
`npm run fit:worker` runs `fit.py`; the body glb is private (`/api/fit-body`, owner only, no
store); the check screen shows the body, "Looks like me" (clears all outlines), Rebuild with
chest, waist and hip, and delete; the sweep clears outlines after 7 days. Steps 5, 6 and 7 remain.

## Request

The owner pasted the spec "Personal Body Mesh from Photos for GroupBasket (v3)": replace the
archetype mannequin in the fit viewer with the buyer's own body fitted from the two onboarding
photos (Anny parametric body model), a "Does this look like you?" confirmation with chest, waist
and hip sliders, shape clusters (~20) with a cached garment drape per garment × cluster, an
opt-in async per-user Deep Fit Test (queue, worker, notification, "Simulated on your body"
report, 5 per day), a CI check forbidding SMPL, SMPL-X, STAR, SUPR, PIFuHD, ECON, ICON and
SMPLify, and a photo-deletion sweeper. Spec build order: plan first, then fitting service with
synthetic tests, profile states and confirmation UI, viewer body swap and drape caching, Deep Fit
Test, licence check and sweeper.

## Owner decision so far

**Photos stay on the phone (keeps `DEC-020` choice 2).** The spec uploaded photos to encrypted
temporary storage. Instead the phone sends only what the fit needs: the downsampled body outlines
(front and side) and the MediaPipe joint positions. The server never sees a photo. The outlines
are deleted when the buyer confirms their body, and the sweeper deletes any older than 7 days.
The owner chose this on 2026-11-15 ("lets add this our new proposed method").

## Where things run (answered 2026-11-15)

- Pose, outline and measurement extraction: the buyer's phone (already built).
- Anny body fitting: a Python worker, CPU only, under 60 s per buyer on one core.
- Confirmation renders: the buyer's phone draws the 3D body itself (no server rendering).
- Product page 3D view: the buyer's phone, as today.
- Garment fit per body cluster: worker, offline, once per garment × cluster.
- Deep Fit Test: worker. Blender cloth is CPU (minutes); XRTailor needs an NVIDIA GPU. A GPU
  only becomes useful if Deep Fit Tests grow and move to XRTailor.
- Start with one 4–8 core CPU worker; job queue as a PostgreSQL table; per-buyer body files in
  storage.

## Findings (checked 2026-11-15)

- **Anny** `0.6.2` on PyPI (`github.com/naver/anny`): code Apache 2.0, MakeHuman-derived assets
  CC0. Install plain `anny` only; the `smpl` extra is non-free. Its Anny→SMPL/SMPL-X functions
  download `noncommercial.zip` from NAVER: never call them, and the licence check must block
  `anny2smpl`, `anny2smplx` and `noncommercial`.
- **6 phenotype controls**, not 11: gender, age, muscle, weight, height, proportions.
- **254 local controls** with `local_changes="default"`, not 256. About 50 are tape measures:
  `measure-bust-circ-incr`, `measure-underbust-circ-incr`, `measure-waist-circ-incr`,
  `measure-hips-circ-incr`, `measure-thigh-circ-incr`, `measure-upperarm-circ-incr`,
  `measure-neck-circ-incr`, `measure-shoulder-dist-incr`, `measure-napetowaist-dist-incr`,
  `measure-waisttohip-dist-incr`, `measure-upperleg-height-incr`, plus torso, hip and stomach
  shape controls. These are the slider and fine-stage parameters.
- 13,718 vertices, 27,420 faces, 104-bone skeleton (can be posed for WALK/RUN/REACH/SIT). Z is up;
  the default body is 1.63 m tall.
- One forward pass: **54 ms on CPU**. ~200 coarse + ~500 fine evaluations fit the 60 s target.
- First model load downloads ~1.4 GB of model data to `~/.cache/anny` (one time per worker); the
  scratch test ran with no GPU (Warp falls back to CPU). The package also ships `anthropometry.py`
  (height, waist circumference, mass) and an `AnnyInverter`.
- Development machine: 16 CPU cores, no NVIDIA GPU, no Blender.

## Existing code it changes

- `tools/fit-simulation/mesh.py` builds an elliptical-ring mannequin and garment; `pipeline.py`
  bakes **body and garment into one glb per motion** (morph targets). A body swap needs the body
  and garment as separate files, played in sync in `src/components/fit/fit-viewer.tsx`.
- Capture (`src/components/fit/capture/`) already produces masks (`Mask`) and landmarks
  (`Landmark`, `LM`); `fit-onboarding.tsx` sends only numbers today.
- Reusable: private storage `src/server/storage`, in-app `notify()` in `src/server/notify`,
  the sweep in `src/server/sweep.ts` (`/api/cron/sweep`).
- No garment pattern data exists (factories enter size charts only), so the spec's "pattern +
  fabric data" gate would never open.

## Proposed plan (not approved)

1. Phone sends outlines + joints as a body-build job; photos never leave the phone.
2. PostgreSQL job table (idempotent, retry-safe) and a worker (`npm run fit:worker`) that hands
   jobs to Python.
3. `tools/body-fitting/`: init from measurements; coarse stage on the 6 phenotypes, fine stage on
   ~40 torso and limb controls; loss = front and side outline match, joint error, height, typed
   measurements, regularisation; CMA-ES; quality score with a failure threshold; pytest on
   synthetic outlines from known parameters.
4. Profile states `none → building → check → confirmed / failed`; confirmation shows the body
   front and side beside the photos (still on the phone) or the outline; chest, waist and hip
   sliders rebuild without new photos.
5. Viewer loads body and garment as separate files; a confirmed body replaces the archetype,
   everything else unchanged.
6. ~20 body clusters; garment fitted around each cluster body from size chart + fabric.
7. Deep Fit Test: button when the body is confirmed; queue; 5 per day; tension on the buyer's
   body for every size and motion; notification; cached until the body is refitted or the
   garment's fit data changes.
8. Licence check script in `npm run check`.

## Open questions (asked, not answered when paused)

1. **Deep Fit Test engine** without Blender, GPU or patterns: geometric on the buyer's own Anny
   body from size chart + fabric, labelled "Fitted to your body" (recommended), or build the
   Blender path now.
2. **Archetype mannequins:** switch them to Anny bodies too so every body looks consistent
   (recommended; regenerates the seed 3D files), or keep the current mannequins.
3. **Personal body file:** private storage served only to its owner (recommended), or a public
   CDN link as the spec says.
