# Fit simulation pipeline

Offline tooling for the personalized fit heatmap ([`DEC-020`](../../docs/decisions.md)). It
simulates each garment once per **garment × archetype × motion**, so the app never simulates per
buyer: the product page adds a cheap per-buyer adjustment
([`src/lib/fit/report.ts`](../../src/lib/fit/report.ts)) to the stored tensions.

```text
garment.json + archetypes ──pipeline.py──▶ OUT/<archetype>/<motion>-<hash>.glb + manifest.json
                                            │
                              load.ts ──────┴─▶ asset host + BodyArchetype, FitAsset,
                                                GarmentRegionTension rows, product fit data
```

## Run

Needs Python 3.12 with numpy. Nothing else is installed into the app.

```sh
python tools/fit-simulation/pipeline.py tools/fit-simulation/seed/garments/crew-tee.json out/crew-tee
npx tsx tools/fit-simulation/load.ts out/crew-tee --title "Crew-neck cotton tee (3-pack)" --approve
```

`load.ts` copies `out/crew-tee` to `public/fit-assets/crew-tee` (served with a one-year immutable
cache, [`next.config.ts`](../../next.config.ts)) and replaces that product's assets and tensions in
one transaction. With an outside CDN, upload the folder there and pass `--base-url`.
`--approve` marks the fit data checked; leave it off to send it to the Factory admin's **Fit**
tab.

The demo garments live in [`seed/garments`](seed/garments) and their output is committed in
`public/fit-assets/seed-<name>` (rebuild all with
`python tools/fit-simulation/pipeline.py tools/fit-simulation/seed/garments public/fit-assets --all --no-meshes`).
`npm run db:seed` loads the 20 standard shapes, every garment onto the product with the same
title, and measures Dilan, Ravindu, Sachini and Ayesha. Tops carry tensions on the ten shapes of
their audience; dresses and bottoms (`"simulate": false`) have a size chart only; Track pants
(`"approved": false`) waits for the Factory admin. `--no-meshes` leaves out the per-motion garment
files, since every standard shape now has a body file. Output is deterministic, so rerunning the
pipeline on unchanged input produces the same file names.

### Standard shapes: 20 body clusters

The standard shapes (archetypes) are 10 men's and 10 women's body clusters, `men-01` ..
`men-10` and `women-01` .. `women-10`, shortest first, committed in
[`seed/clusters.json`](seed/clusters.json):

```sh
.venv/Scripts/python tools/fit-simulation/clusters.py   # about 2 minutes
```

It samples 4000 adult Anny bodies per gender (weight, muscle, height and proportions uniform,
age a young adult's, heights 140-200 cm kept), measures height, chest, waist and hip like a
buyer's body, and runs k-means (numpy, fixed seed) on the standardised measurements. Each shape is
the sampled body nearest its cluster centre, so its Anny phenotype rebuilds exactly its
measurements; `share` is the part of the sample in its cluster. Thigh, upper arm, shoulder, neck,
wrist and inseam are estimated from the girths and height for the garment simulation. A buyer is
matched to the nearest shape of their gender by standardised distance over height, chest, waist
and hip (`nearestArchetype` in [`src/server/fit.ts`](../../src/server/fit.ts)), again on every
save of their measurements. Tests: `.venv/Scripts/python -m pytest tools/fit-simulation/tests -q`
(the `anny` ones need the body-fitting environment).

### Standard bodies (DEC-021)

Every standard shape is also written as an Anny body with a skeleton, from its stored phenotype.
The viewer draws the garment over it in the browser, the same way as over a buyer's own body:

```sh
.venv/Scripts/python tools/fit-simulation/anny_bodies.py public/fit-assets/bodies
npx tsx --conditions=react-server tools/fit-simulation/load.ts --bodies public/fit-assets/bodies
```

The first needs the [body-fitting](../body-fitting/README.md) environment; the seed runs the
second step itself. A shape with a body file no longer uses the per-motion garment files below.

## Files

| File                               | Does                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| [`clusters.py`](clusters.py)       | The 20 standard shapes as body clusters (`seed/clusters.json`)                          |
| [`archetypes.py`](archetypes.py)   | Loads the standard shapes                                                               |
| [`anny_bodies.py`](anny_bodies.py) | Their Anny body files in `public/fit-assets/bodies`                                     |
| [`mesh.py`](mesh.py)               | Measurement-driven body and garment meshes, area ids, the four motions as morph targets |
| [`simulate.py`](simulate.py)       | Per-size area tension; `analytic` engine now, `blender` later                           |
| [`blender_sim.py`](blender_sim.py) | Planned Blender headless cloth step (not wired)                                         |
| [`gltf.py`](gltf.py)               | Binary glTF writer with the `_REGION_ID` attribute and morph animation                  |
| [`pipeline.py`](pipeline.py)       | Runs everything and writes `manifest.json`                                              |
| [`load.ts`](load.ts)               | Copies files and inserts rows                                                           |
| [`seed/`](seed)                    | The demo garments and the clusters                                                      |

## Contract with the app

- **Areas:** `_REGION_ID` per garment vertex: 0 chest, 1 waist, 2 hip, 3 upper arm, 4 thigh,
  5 shoulder, 6 length (torso), 255 neutral (normal material). Same order as `REGION_ID` in
  [`src/lib/fit/regions.ts`](../../src/lib/fit/regions.ts). Meshes without the attribute (the
  body) render plain.
- **Motions:** one file per `WALK`, `RUN`, `REACH`, `SIT`, each with one looping animation.
- **Tension:** 0 slack to 1 tight per (archetype, size, area), the peak over the four motions.
  The length area compares a top's length with the torso plus the hem drop (12 cm, equal to
  `FIT.torsoHemDrop` in [`config.ts`](../../src/lib/fit/config.ts)).
- **Sizes and areas** come from the garment's size chart, in the app's keys (`chest`, `waist`,
  `hip`, `upperArm`, `thigh`, `shoulder`, `torso`), cm.

## Onboarding a factory garment

1. The factory enters the size chart and fabric on its product (Fit data); an admin checks it.
2. Get the pattern pieces per size and the fabric's stretch, bend and shear stiffness and gsm
   from the factory (or measure the test piece we buy).
3. Write `garment.json` like [`seed/garments/crew-tee.json`](seed/garments/crew-tee.json).
4. Run the pipeline, then `load.ts --product <id>`.

## Licences and limits

- Production bodies come from our own generator (`mesh.py`) or MakeHuman (AGPL) as an isolated
  build step. **SMPL/SMPL-X** model files are research-only: prototypes only, never production.
  No CC BY-NC try-on weights (IDM-VTON, CatVTON, OOTDiffusion).
- Blender (GPL) and XRTailor (Apache 2.0) run as separate processes; nothing is linked into the
  app.
- **Not real cloth simulation yet.** The `analytic` engine is a strain model with hand-set motion
  loads. Its numbers and the k/k2 constants in the app are starting values to calibrate against
  "How did it fit?" feedback (Factory admin → Fit).
- Draco compression is not applied to the seed files (about 200 KB each); run
  `npx @gltf-transform/cli draco in.glb out.glb` before upload in production. The viewer decodes
  either.
