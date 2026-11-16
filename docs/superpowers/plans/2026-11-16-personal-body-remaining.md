# Personal 3D Body: Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish everything `DEC-021` left unbuilt: phone testing, real-person accuracy, a deployable worker, motions on the buyer's own body, Anny mannequins, body clusters, and a real cloth simulation with a queued Deep Fit Test.

**Architecture:** Six phases, each shippable alone and in this order, because each later phase builds on the body the earlier ones prove correct. Phases 1–3 make the existing feature safe to launch. Phase 4 gives every body file a skeleton so one set of motion clips in the browser animates any body and its garment. Phase 5 turns the standard mannequins into Anny bodies, which then serve as the body clusters. Phase 6 adds a Blender cloth simulation, run offline per garment × cluster and on request per buyer.

**Tech Stack:** Next.js 16, Prisma 7 / PostgreSQL, Three.js 0.187, Python 3.12 with Anny 0.6.2, `cma`, numpy; Blender 4.5 LTS headless (new, Phase 6); an S3-compatible object store (new, Phase 3).

**Spec:** [`DEC-021`](../../decisions.md) and [the parked plan](personal-body-mesh-paused.md), which holds the owner's pasted spec "Personal Body Mesh from Photos (v3)", the findings and the three assumed answers.

## Global Constraints

- "SMPL, SMPL-X, STAR, SUPR model files are research-only, non-commercial — FORBIDDEN in any production path."
- "PIFuHD, ECON, ICON, SMPLify are CC-BY-NC / non-commercial — FORBIDDEN."
- Allowed: Anny, MHR, MediaPipe, rembg, Blender/bpy, XRTailor, Three.js, Rocketbox. Install plain `anny`, never its extras. `npm run check:licences` must stay green after every task.
- Photos never leave the phone. Only outlines, joints, height and typed measurements are sent.
- The body file is private: served only to its owner, `private, no-store`, 404 to everyone else.
- `UX-001`: no explanatory text in the UI. The only new buyer-facing wording allowed is the labels this plan names.
- Blender (GPL) runs only as a separate process. Nothing from it is linked or imported into the app.
- Run tests from `E:\` (uppercase drive). Stage files by path, never `git add -A`. Log each task in `docs/CHANGES.md`; commit and push to `origin main` after each task.
- Never reset the dev database. New migrations: `prisma migrate diff` against HEAD, then `prisma migrate deploy`.
- Python that loads Anny carries the pytest marker `anny`; tests that need Blender carry `blender` and skip when `BLENDER_BIN` is unset.

## Review Focus

1. **A body built before Phase 4 has no skeleton.** The viewer must show it standing still with the motion buttons hidden, not crash. Test in Task 4.3.
2. **A buyer saves new photos while an old build or Deep Fit Test is running.** The old result must not overwrite or be shown against the new body. Tests in Tasks 3.2 and 6.5.
3. **A garment size far smaller than the body.** The cloth simulation must finish and report maximum tension, not explode or hang. Test in Task 6.2.
4. **Calibration from very few volunteers.** Fewer than 5 cases must refuse to write calibration values rather than fit noise. Test in Task 2.2.
5. **The worker and the app use different storage.** A body written by the worker must be readable by `/api/fit-body` on another machine. Test in Task 3.1.

## Owner decisions this plan assumes

Each is used as written unless the owner says otherwise; none blocks Phases 1–2.

| # | Assumed | Affects |
|---|---|---|
| A | Object storage is S3-compatible (any provider) | Phase 3 |
| B | The body feature is off for real buyers until Phase 2's accuracy gate passes | Phase 2 |
| C | Body clusters reuse the `BodyArchetype` table (about 20 rows); no separate cluster table | Phases 5–6 |
| D | The `FitAsset` table and the old tube mannequin are removed once every archetype has an Anny body | Phase 5 |
| E | Cloth engine is Blender on CPU; XRTailor (needs an NVIDIA GPU) only if the Phase 6 spike fails | Phase 6 |
| F | Deep Fit Test: 5 per buyer per day, result label "Simulated on your body" | Phase 6 |

---

## Phase 1 — Phone camera testing

### Task 1.1: HTTPS dev mode for phones

**Files:**
- Modify: `package.json` (script `dev:phone`), `next.config.ts` (`allowedDevOrigins`), `.env.example`, `docs/development-tooling.md`
- Test: `tests/tooling/dev-phone.test.mjs`

**Interfaces:**
- Produces: `npm run dev:phone` = `next dev -p 3002 --experimental-https -H 0.0.0.0`; env `DEV_PHONE_HOST` (the computer's LAN address) added to `allowedDevOrigins` when set.

- [ ] **Step 1: Failing test** — `dev-phone.test.mjs` asserts `package.json` `scripts["dev:phone"]` contains `--experimental-https` and `-H 0.0.0.0`, and that `next.config.ts` reads `DEV_PHONE_HOST`.
- [ ] **Step 2:** Run `npm run test:tooling`; expect FAIL.
- [ ] **Step 3:** Add the script and `allowedDevOrigins: process.env.DEV_PHONE_HOST ? [process.env.DEV_PHONE_HOST] : []`. Add the generated `certificates/` folder to `.gitignore`.
- [ ] **Step 4:** Run `npm run test:tooling`; expect PASS.
- [ ] **Step 5: Manual check on a real phone** (record the result in `docs/CHANGES.md`): open `https://<LAN address>:3002`, sign in, take both photos, save, see "Building…". Note the phone model, browser and whether the pose model loaded.
- [ ] **Step 6:** Document the steps under "Testing on a phone" in `docs/development-tooling.md`. Commit.

---

## Phase 2 — Accuracy on real people

### Task 2.1: Export a volunteer's job as a test case

**Files:**
- Create: `scripts/export-body-case.ts`, `tools/body-fitting/cases/.gitignore` (ignores everything but itself)
- Test: `tests/integration/body-fit.int.test.ts` (new test)

**Interfaces:**
- Produces: `npx tsx scripts/export-body-case.ts <email> --name <label> --chest <cm> --waist <cm> --hip <cm>` writes `tools/body-fitting/cases/<label>.json` = `{ "job": <BodyFitJob.input>, "tape": { "chest": n, "waist": n, "hip": n } }`. Exported function `exportBodyCase(db, email, tape): Promise<{ job: unknown; tape: Tape }>`; throws `"No outlines stored"` when the newest job's `input` is null (already confirmed or swept).

- [ ] **Step 1: Failing test** — queue a build for a seeded buyer, call `exportBodyCase`, expect `job.heightCm` to equal the profile height and `tape.waist` to equal the value passed; after `confirmBody`, expect it to reject with `"No outlines stored"`.
- [ ] **Step 2:** Run the integration test; expect FAIL.
- [ ] **Step 3:** Implement. The case folder is git-ignored because outlines are personal data.
- [ ] **Step 4:** Run; expect PASS. Commit.

### Task 2.2: Accuracy report and calibration

**Files:**
- Create: `tools/body-fitting/accuracy.py`, `tools/body-fitting/calibration.json`
- Modify: `tools/body-fitting/outline.py` (apply calibration), `tools/body-fitting/fit.py` (load it), `tools/body-fitting/README.md`
- Test: `tools/body-fitting/tests/test_accuracy.py`

**Interfaces:**
- Produces:
  - `calibration.json`: `{ "clothingCm": 0.0, "shoulderDropCm": 0.0, "hipDropCm": 0.0, "cases": 0 }`. `clothingCm` is taken off each side of every outline width; the two drops move MediaPipe's shoulder and hip rows along the torso axis to Anny's joints.
  - `outline.observe(front, side, height_cm, cal: dict | None = None) -> Observed`.
  - `accuracy.report(cases: list[dict], cal: dict) -> dict` returning, for each of `chest`, `waist`, `hip`: `{ "bias": mean signed error cm, "mae": mean absolute error cm, "sd": cm }`, plus `"failed": count`, `"cases": count`.
  - `accuracy.calibrate(cases: list[dict]) -> dict` — a grid search over `clothingCm` 0–3 (step 0.25) and the two drops −4–4 (step 1) that minimises the summed squared bias; raises `ValueError("need at least 5 cases")` below 5.
  - CLI: `accuracy.py cases/ [--calibrate]` prints the report as JSON; `--calibrate` also rewrites `calibration.json`.

- [ ] **Step 1: Failing tests**

```python
@pytest.mark.anny
def test_calibrate_recovers_a_known_clothing_allowance(body):
    cases = [widened_case(body, seed, clothing_cm=1.5) for seed in range(6)]  # synthetic.make_job, outline widened 1.5 cm a side
    cal = accuracy.calibrate(cases)
    assert abs(cal["clothingCm"] - 1.5) <= 0.25
    rep = accuracy.report(cases, cal)
    assert all(abs(rep[k]["bias"]) < 1.0 for k in ("chest", "waist", "hip"))

def test_calibrate_refuses_fewer_than_five_cases():
    with pytest.raises(ValueError, match="at least 5"):
        accuracy.calibrate([{}] * 4)
```

- [ ] **Step 2:** Run `python -m pytest tools/body-fitting/tests/test_accuracy.py -q`; expect FAIL.
- [ ] **Step 3:** Implement. Add `widened_case` to `synthetic.py`. With all-zero calibration every existing test must still pass unchanged.
- [ ] **Step 4:** Run the whole Python suite; expect PASS. Commit.

### Task 2.3: Release gate

**Files:**
- Modify: `src/server/body-fit.ts`, `src/app/account/fit/fit-onboarding.tsx`, `.env.example`, `docs/decisions.md` (`DEC-021`)
- Test: `tests/integration/body-fit.int.test.ts`

**Interfaces:**
- Produces: `bodyFitEnabled(): boolean` in `src/server/body-fit.ts`, true when `BODY_FIT_ENABLED === "1"`. When false, `queueBodyFit` is not called and the onboarding form does not send `outlines`; existing bodies still display.

- [ ] **Step 1: Failing test** — with the flag off, `saveBodyProfile` with outlines saves measurements and creates no `BodyFitJob`; with it on, one job.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Run the study** (people, not code): at least 10 volunteers, both genders, tape-measured chest, waist and hip in fitted clothes; export each with Task 2.1; run `accuracy.py cases/ --calibrate`. **Gate:** mean absolute error ≤ 2.0 cm for each of chest, waist and hip, and no more than 2 in 10 builds failed. Record the numbers in `tools/body-fitting/README.md` ("Accuracy") and `DEC-021`. Only then set `BODY_FIT_ENABLED=1` in production. If the gate fails, stop and report; do not start Phase 3.
- [ ] **Step 6:** Commit.

---

## Phase 3 — A worker that can be deployed

### Task 3.1: S3-compatible storage

**Files:**
- Create: `src/server/storage/s3.ts`
- Modify: `src/server/storage/index.ts`, `scripts/fit-worker.ts`, `.env.example`, `docs/architecture.md`, `package.json` (`@aws-sdk/client-s3`)
- Test: `src/server/storage/s3.test.ts`

**Interfaces:**
- Consumes: `interface Storage { put(key, bytes); get(key); delete(key) }` (existing).
- Produces: `class S3Storage implements Storage` built from `STORAGE_S3_BUCKET`, `STORAGE_S3_ENDPOINT`, `STORAGE_S3_REGION`, `STORAGE_S3_KEY`, `STORAGE_S3_SECRET`; `storage()` returns it when `STORAGE_DRIVER === "s3"`, else the local disk. `fit-worker.ts` calls `storage()` instead of constructing `LocalDiskStorage`.

- [ ] **Step 1: Failing test** — against an injected fake S3 client: `put` then `get` returns the same bytes; `get` of a missing key returns `null` (not a throw); `delete` of a missing key resolves; a key containing `..` is rejected.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Commit.

### Task 3.2: Keep Python loaded between jobs

**Files:**
- Modify: `tools/body-fitting/fit.py` (`--serve`), `scripts/fit-worker.ts`, `src/server/body-fit-jobs.ts`
- Test: `tools/body-fitting/tests/test_fit.py`, `tests/integration/body-fit.int.test.ts`

**Interfaces:**
- Produces:
  - `fit.py --serve`: reads one JSON object per line on stdin, `{ "id": str, "job": {...}, "glb": path | null }`; writes one line per request on stdout, `{ "id": str, "result": {...} }`; prints `{"ready": true}` once Anny is loaded. A bad line returns `{ "id": …, "error": str }` and the process keeps running.
  - The worker starts one such process per concurrency slot, restarts it if it exits, and kills it after 5 min on one job.
  - `runBodyFitJob` writes the result only if the job row is still `RUNNING` with the same `startedAt` (a newer save must win).

- [ ] **Step 1: Failing tests** — Python: two jobs on one `--serve` process return two results with matching ids, and a malformed line yields an `error` line then a correct result for the next job. Integration: job A is claimed, the buyer saves again (job B), A's runner then finishes; expect the profile to stay `BUILDING` for B and A's glb not stored.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Time 5 jobs in a row; record seconds per job in the README (expected: about 20 s instead of 40 s). Commit.

### Task 3.3: Container image and queue alert

**Files:**
- Create: `tools/body-fitting/Dockerfile`, `tools/body-fitting/.dockerignore`
- Modify: `src/server/sweep.ts` (step `bodyFitQueue`), `src/server/body-fit-jobs.ts`, `docs/architecture.md`
- Test: `tests/integration/body-fit.int.test.ts`

**Interfaces:**
- Produces:
  - Image: Node 24 + Python 3.12, `npm ci`, `pip install -r tools/body-fitting/requirements.txt`, Anny's 1.4 GB data downloaded at build time, entry `npm run fit:worker`.
  - `staleQueue(db, now): Promise<number>` — count of `QUEUED` jobs older than 15 min. The sweep sends one notification with id `body-fit-queue:<yyyy-mm-dd>` to CORE admins when it is above 0.

- [ ] **Step 1: Failing test** — a `QUEUED` job created 20 min ago makes the sweep create exactly one admin notification; running the sweep again that day creates no second one; a 5-minute-old job creates none.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** `docker build -f tools/body-fitting/Dockerfile .` and run it against the dev database with `--once`; expect `body fit …: check`. Write the deployment steps (image, the six env variables, one worker per 2 CPU cores) in `docs/architecture.md`. Commit.

---

## Phase 4 — Motions on the buyer's own body

### Task 4.1: Skeleton in the body file

**Files:**
- Create: `tools/body-fitting/skin.py`
- Modify: `tools/fit-simulation/gltf.py` (skins), `tools/body-fitting/fit.py` (`write_body`)
- Test: `tools/body-fitting/tests/test_skin.py`

**Interfaces:**
- Produces:
  - `skin.BONES`: the 36 body bones, in Anny's order: `root`, `pelvis.L/R`, `upperleg01/02.L/R`, `lowerleg01/02.L/R`, `foot.L/R`, `spine05`…`spine01`, `clavicle.L/R`, `shoulder01.L/R`, `upperarm01/02.L/R`, `lowerarm01/02.L/R`, `wrist.L/R`, `neck01`–`neck03`, `head`.
  - `skin.skin_for(body: AnnyBody, heads: np.ndarray) -> Skin` with `names: list[str]`, `parents: list[int]` (−1 for root), `heads: (36, 3) float32` in the file's axes (Y up, +Z front, feet at y = 0), `joints: (N, 4) uint8`, `weights: (N, 4) float32`. Anny's 9 weights per vertex are folded onto the 36 bones (each dropped bone's weight goes to its nearest kept ancestor: fingers to the wrist, face bones to the head, toes to the foot), the top 4 kept and renormalised to sum to 1.
  - `gltf.Mesh.skin: Skin | None`; `write_glb` then writes `JOINTS_0`, `WEIGHTS_0`, one node per bone with translation only (head minus parent head, identity rotation) and inverse bind matrices that are pure translations.
  - `write_body` adds the skin and sets `asset.extras.bodyVersion = 2`.

- [ ] **Step 1: Failing tests**

```python
@pytest.mark.anny
def test_skin_weights_are_normalised_and_cover_every_vertex(body):
    verts, heads = body.forward(np.full((1, 6), 0.5))
    s = skin.skin_for(body, heads[0])
    assert len(s.names) == 36 and s.parents[0] == -1
    assert np.allclose(s.weights.sum(axis=1), 1.0, atol=1e-5)
    assert s.joints.max() < 36

def test_glb_with_a_skin_has_joints_and_inverse_binds(tmp_path):
    ...  # write a 3-vertex mesh with a 2-bone skin; parse the JSON chunk
    assert doc["skins"][0]["joints"] == [1, 2] and "JOINTS_0" in prim["attributes"]
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Commit.

### Task 4.2: Motion clips as data

**Files:**
- Create: `src/lib/fit/motion.ts`, `src/lib/fit/motion.test.ts`

**Interfaces:**
- Produces:
  - `type Motion = "WALK" | "RUN" | "REACH" | "SIT"`.
  - `CLIPS: Record<Motion, { duration: number; loop: boolean; tracks: { bone: string; times: number[]; degrees: [number, number, number][] }[] }>` — Euler XYZ in degrees about the file's axes (X to the body's left, Y up, Z front). Angles mirror `MOTIONS` in `tools/fit-simulation/mesh.py` so own bodies and old mannequins move alike: WALK thighs ±25°, knees 0–35°, arms ±20°; RUN thighs ±45°, knees 0–80°, arms ±40° with elbows 70°; REACH both upper arms raised 150° about X; SIT thighs 90° forward, knees 90° back, spine 5°.
  - `poseAt(motion: Motion, t: number): Record<string, [number, number, number]>` — linear interpolation, wrapping when `loop`.
  - `clipFor(THREE, motion): THREE.AnimationClip` — one `QuaternionKeyframeTrack` named `<bone>.quaternion` per track.

- [ ] **Step 1: Failing tests** — every bone named in `CLIPS` is one of the 36 from Task 4.1 (copy the list into `motion.ts` as `BONES` and keep the Python test asserting both lists are equal by reading the TS file); `poseAt("WALK", 0)` and `poseAt("WALK", CLIPS.WALK.duration)` are equal; `poseAt("SIT", …)["upperleg01.L"][0]` is −90 at the end; left and right thigh angles in WALK are opposite at every keyframe.
- [ ] **Step 2–4:** Run `npm test` (FAIL), implement, run (PASS). Commit.

### Task 4.3: Animated body and garment in the viewer

**Files:**
- Modify: `src/lib/fit/drape.ts`, `src/lib/fit/drape.test.ts`, `src/components/fit/fit-viewer.tsx`, `src/components/fit/fit-module.tsx`, `src/server/fit.ts`
- Test: `src/lib/fit/drape.test.ts`, `tests/e2e/fit-body.spec.ts`

**Interfaces:**
- Consumes: `clipFor`, `Motion` (4.2); `JOINTS_0`/`WEIGHTS_0` in the body file (4.1).
- Produces:
  - `garmentSkin(g: Garment, joints: ArrayLike<number>, weights: ArrayLike<number>): { skinIndex: Uint16Array; skinWeight: Float32Array }` — the body's four joints and weights copied per `g.source`.
  - `FitView.personal` gains `animated: boolean` (true when the stored `bodyFit.bodyVersion >= 2`; the worker saves the version in `bodyFit`).
  - Viewer: when the loaded body is a `SkinnedMesh`, the garment is a `SkinnedMesh` bound to the same skeleton with the same bind matrix, and the mixer plays `clipFor(motion)`. `heatMaterial` keeps working because it patches a `MeshLambertMaterial`, which already includes the skinning chunks.
  - `FitModule` shows the motion and play controls for a personal body only when `personal.animated`.

- [ ] **Step 1: Failing unit test** — `garmentSkin` on the existing 5-vertex strip returns `skinIndex` of length `4 * g.source.length` whose entries equal the body's joints at `g.source[i]`.
- [ ] **Step 2: Failing e2e** — signed in as a buyer with a version-2 body: the Fit section shows four motion buttons, pressing "Sit" leaves the canvas non-blank and logs no console error. With a version-1 body (the Review Focus case): no motion buttons, canvas non-blank, no error.
- [ ] **Step 3–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Look at each garment type in each motion in the browser at 360 px and desktop; the garment must not show the body poking through at the hip in SIT. If it does, raise `MIN_GAP_CM` for `PART.seat` and `PART.thigh` only while SIT plays. Commit.

### Task 4.4: Upgrade bodies built before the skeleton

**Files:**
- Modify: `src/server/body-fit.ts`, `scripts/fit-worker.ts`, `tools/body-fitting/fit.py`
- Test: `tests/integration/body-fit.int.test.ts`

**Interfaces:**
- Produces: `fit.py --rewrite` (serve-mode request `{ "id", "params": { "phenotype", "local" }, "glb": path }`) writes the body file from stored parameters without refitting. `upgradeBodies(db, storage, run, limit = 20): Promise<number>` rewrites `CONFIRMED` bodies whose `bodyFit.bodyVersion` is below 2; the worker calls it when the queue is empty. The status stays `CONFIRMED`; no notification.

- [ ] **Step 1: Failing test** — a confirmed version-1 profile becomes version 2 with a new file key, the old file is deleted, and the status and `bodyFitAt` are unchanged.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Commit.

---

## Phase 5 — Standard mannequins become Anny bodies

### Task 5.1: Fit an Anny body from measurements alone

**Files:**
- Modify: `tools/body-fitting/fit.py`
- Test: `tools/body-fitting/tests/test_fit.py`

**Interfaces:**
- Produces: `Fitter.fit_measurements(height_cm: float, gender: int, typed: dict[str, float]) -> dict` — same result shape as `fit`, with `quality.rows == 0`; Levenberg-Marquardt on weight, muscle, proportions and the bust, waist and hip controls against the typed girths (SD 0.5 cm) with the existing prior. CLI: `fit.py --measurements job.json --glb out.glb`.

- [ ] **Step 1: Failing test** — for `height 168, gender 1, chest 88, waist 70, hip 96` the result's measurements are each within 1.0 cm and height within 0.5 cm.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Commit.

### Task 5.2: Archetype body files and the unified viewer path

**Files:**
- Create: `tools/fit-simulation/anny_bodies.py`
- Modify: `prisma/schema.prisma` (`BodyArchetype.bodyUrl String?`), new migration, `tools/fit-simulation/load.ts`, `prisma/seed.ts`, `src/server/fit.ts`, `src/components/fit/fit-module.tsx`, `src/app/products/[id]/fit-section.tsx`
- Test: `tests/integration/fit.int.test.ts`

**Interfaces:**
- Consumes: `fit_measurements`, `write_body` (skinned).
- Produces:
  - `anny_bodies.py <archetypes.json | seed> <out dir>` writes `<name>-<hash>.glb` per archetype and `bodies.json` (`{ name: file }`); output is deterministic.
  - `FitView.personal` is renamed `FitView.body: { url: string; fitClass: FitClass; short: boolean; animated: boolean; own: boolean } | null`. It is the buyer's confirmed body when there is one (`own: true`), otherwise the matched archetype's `bodyUrl`. Archetype bodies are public files under `/fit-assets/bodies/`.
  - `FitModule` takes `body` and no longer needs `assets` when `body` is set.

- [ ] **Step 1: Failing test** — a buyer with measurements and no own body gets `view.body.own === false` and a URL under `/fit-assets/bodies/`; a buyer with a confirmed body gets `own === true` and `/api/fit-body`; a signed-out visitor gets `body === null`.
- [ ] **Step 2–4:** Run (FAIL), implement, generate the four seed bodies into `public/fit-assets/bodies/`, run (PASS).
- [ ] **Step 5:** Browser check of one top, one bottom and one dress as Ravindu (no own body) and Dilan (own body). Commit.

### Task 5.3: Remove the old mannequin path

Do this only after the owner agrees to assumption D; it drops a table.

**Files:**
- Modify: `prisma/schema.prisma` (drop `FitAsset`, `Product.fitAssets`, `BodyArchetype.assets`), new migration, `tools/fit-simulation/pipeline.py` and `load.ts` (tensions only), `src/server/fit.ts` (drop `assets`), `src/components/fit/fit-viewer.tsx` (drop the morph-animation branch), `tools/fit-simulation/README.md`, `docs/architecture.md`
- Delete: `public/fit-assets/seed-*/**/*.glb`; the body and garment generators in `tools/fit-simulation/mesh.py` (keep `MOTIONS` only if a test still reads it, else delete the file)
- Test: `tests/integration/fit.int.test.ts`, existing e2e fit specs

- [ ] **Step 1:** Update the tests that assert `assets` to assert `body`; run; expect FAIL where the old path is still used.
- [ ] **Step 2:** Remove the code, write the migration with `migrate diff`, apply with `migrate deploy`.
- [ ] **Step 3:** `npm run check`, `npm run test:int`, `npm run e2e`; expect PASS. Commit.

---

## Phase 6 — Cloth simulation, clusters and the Deep Fit Test

### Task 6.1: Spike — can Blender do this fast enough? (go / no-go)

Not production code. Time-box: 2 days. Needs Blender 4.5 LTS installed (ask the owner before installing; about 400 MB) and `BLENDER_BIN` set.

**Files:**
- Create: `tools/cloth-sim/spike.py`, `tools/cloth-sim/SPIKE.md`

- [ ] **Step 1:** In `blender -b -P spike.py`: load Dilan's skinned body glb, build a tee as the body's covered surface pushed out to the size chart's circumferences, give it Blender cloth with self-collision off and the body as collider, play WALK and REACH for 40 frames each, and write per-vertex edge strain.
- [ ] **Step 2:** Run it for a size that fits, one two sizes too small and one two sizes too large.
- [ ] **Step 3:** Write the measurements in `SPIKE.md`. **Go** only if all hold: one size finishes in under 3 min on 8 cores; no size explodes (no vertex further than 0.5 m from the body); mean chest strain orders the three sizes small > fit > large. **No-go:** stop Phase 6 and report to the owner with the numbers; the alternatives are XRTailor on a GPU machine or keeping the geometric engine.
- [ ] **Step 4:** Commit the spike and its findings.

### Task 6.2: The simulation tool

**Files:**
- Create: `tools/cloth-sim/garment.py`, `tools/cloth-sim/fabric.py`, `tools/cloth-sim/simulate.py` (runs inside Blender), `tools/cloth-sim/run.py` (plain Python: starts Blender, reads the result), `tools/cloth-sim/tests/test_cloth.py`, `tools/cloth-sim/README.md`
- Modify: `scripts/check-licences.mjs` only if it flags the new folder

**Interfaces:**
- Produces:
  - `garment.build(body_glb: str, cls: str, short: bool, chart_row: dict[str, float]) -> Garment` — plain numpy (no Blender): vertices, faces, per-vertex region id, per-vertex 4 joints and weights, and `rest_scale` per region = chart circumference ÷ the shell's own circumference at that region. A size smaller than the body gets `rest_scale < 1`, which is what puts the cloth in tension.
  - `fabric.params(gsm: float | None, stretch_pct: float | None, weave: str | None) -> dict` — Blender cloth settings: `mass` from gsm (default 160), `tension_stiffness = 15 / (1 + stretch_pct / 10)`, `bending_stiffness` 0.5 for knits, 5 for wovens.
  - `run.simulate(job: dict, out_dir: str, timeout_s: int = 600) -> dict`. Job: `{ "body": glb path, "cls", "short", "sizes": { "M": { "chest": 100, … } }, "fabric": {…}, "motions": ["WALK","RUN","REACH","SIT"] }`. Result: `{ "status": "ok" | "failed", "sizes": { "M": { "tension": { "chest": 0.31, … }, "garment": "M.glb" } }, "seconds": n }`.
  - Tension per region = the 95th percentile of edge strain over that region's vertices and all frames, mapped to 0–1 as `clamp(strain / (stretch_pct / 100 + 0.05), 0, 1)`.
  - `<size>.glb`: the simulated garment in the rest pose (the last settled frame before the first motion), with `_REGION_ID`, `JOINTS_0` and `WEIGHTS_0`, so the browser animates it with the Phase 4 skeleton.
  - A size that explodes or times out is reported as tension 1.0 for every region with `"note": "unstable"`; other sizes still return.

- [ ] **Step 1: Failing tests**

```python
def test_rest_scale_is_below_one_for_a_size_smaller_than_the_body(body_glb):
    g = garment.build(body_glb, "top", False, {"chest": 80, "waist": 70, "hip": 85})
    assert g.rest_scale[REGION_ID["chest"]] < 1.0

def test_fabric_gets_softer_with_stretch():
    assert fabric.params(160, 20, "knit")["tension_stiffness"] < fabric.params(160, 0, "woven")["tension_stiffness"]

@pytest.mark.blender
def test_smaller_sizes_are_tighter_and_tiny_sizes_do_not_hang(body_glb, tmp_path):
    r = run.simulate(job(body_glb, sizes={"XS": chest(76), "M": chest(100), "XXL": chest(124)}), tmp_path, timeout_s=600)
    t = {s: r["sizes"][s]["tension"]["chest"] for s in r["sizes"]}
    assert r["status"] == "ok" and t["XS"] >= t["M"] >= t["XXL"] and t["XS"] > 0.8
```

- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS; the Blender test only where `BLENDER_BIN` is set). Commit.

### Task 6.3: About 20 clusters, as archetypes

**Files:**
- Create: `tools/fit-simulation/clusters.py`, `tools/fit-simulation/seed/clusters.json` (output, committed)
- Modify: `tools/fit-simulation/archetypes.py`, `tools/fit-simulation/anny_bodies.py`, `prisma/seed.ts`, `src/server/fit.ts` (archetype matching)
- Test: `tools/fit-simulation/tests/test_clusters.py`, `tests/integration/fit.int.test.ts`

**Interfaces:**
- Produces:
  - `clusters.build(per_gender: int = 10, samples: int = 4000, seed: int = 1) -> list[dict]` — samples adult Anny bodies per gender (weight, muscle, height, proportions uniform), measures height, chest, waist and hip, runs k-means (k = `per_gender`, fixed seed, standardised features) and returns one archetype per centre: `{ "name": "men-03", "gender": "MEN", "params": { "height", "chest", "waist", "hip", … }, "anny": { phenotype, local } }`.
  - `nearestArchetype(gender, measurements)` in `src/server/fit.ts` picks by standardised distance over height, chest, waist and hip (replacing the present rule); a buyer's archetype is re-picked when measurements are saved.

- [ ] **Step 1: Failing tests** — Python: `build()` twice gives identical output; 20 clusters, 10 per gender; no two centres of one gender are closer than 2 cm in every feature. Integration: a buyer whose measurements equal `women-04`'s is matched to `women-04`.
- [ ] **Step 2–4:** Run (FAIL), implement, generate bodies for the 20 archetypes, run (PASS).
- [ ] **Step 5:** The four old seed archetypes are replaced; reseed the dev database and check the product pages still show a body. Commit.

### Task 6.4: Simulate each garment on each cluster, offline

**Files:**
- Create: `tools/cloth-sim/batch.py`
- Modify: `prisma/schema.prisma` (new `ClusterDrape`), new migration, `tools/fit-simulation/load.ts`, `src/server/fit.ts`, `src/components/fit/fit-viewer.tsx`, `src/server/fit.ts` `saveFitData` (invalidate)
- Test: `tests/integration/fit.int.test.ts`

**Interfaces:**
- Consumes: `run.simulate` (6.2); archetype bodies (5.2, 6.3).
- Produces:
  - `model ClusterDrape { id, productId, archetypeId, size, garmentUrl, fitDataHash, createdAt; @@unique([productId, archetypeId, size]) }`.
  - `batch.py <product export json> <out dir>` runs `simulate` for every archetype of the garment's gender and writes `manifest.json`; `load.ts --drapes <out dir>` upserts `GarmentRegionTension` rows (`baseTension` = simulated tension, `note` = `"simulated"`) and `ClusterDrape` rows, in one transaction per product.
  - `fitDataHash` = SHA-256 of the product's size chart and fabric fields. `saveFitData` deletes the product's `ClusterDrape` rows when the hash changes, so a stale drape is never shown.
  - `FitView.body` gains `garments: Record<string, string> | null` (size → garment URL) when drapes exist for the buyer's archetype and the buyer has no own body. The viewer then loads that garment file and binds it to the skeleton instead of building the pushed-out shell; without it, it draws the shell as today.

- [ ] **Step 1: Failing tests** — after `load.ts --drapes` on a fixture manifest, `getFitView` returns `body.garments` with every chart size and the report's chest tension equals the simulated value plus the existing per-buyer adjustment; after `saveFitData` changes the chart, `body.garments` is null.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Run the batch for the seed garments; record minutes per garment in `tools/cloth-sim/README.md`. Commit.

### Task 6.5: Deep Fit Test — queue, worker, limit, notification

**Files:**
- Create: `src/server/deep-fit-jobs.ts`, `src/server/deep-fit.ts`, `scripts/sim-worker.ts`, `src/app/api/fit-garment/route.ts`, `tests/integration/deep-fit.int.test.ts`
- Modify: `prisma/schema.prisma` (new `DeepFitJob`), new migration, `src/server/fit-actions.ts`, `src/server/fit.ts`, `src/server/sweep.ts`, `src/server/body-fit.ts` (`deleteBody` also deletes deep-fit files), `package.json` (`sim:worker`)

**Interfaces:**
- Consumes: `run.simulate` (6.2), `Storage`, `notify()`.
- Produces:
  - `model DeepFitJob { id, userId, productId, status (QUEUED|RUNNING|DONE|FAILED), attempts, error, bodyFitAt DateTime, fitDataHash String, result Json?, startedAt, createdAt, updatedAt; @@index([status, createdAt]); @@index([userId, createdAt]) }`.
  - `DEEP_FIT_PER_DAY = 5`.
  - `requestDeepFit(userId, productId): Promise<{ jobId: string }>` — requires a `CONFIRMED` body and an approved chart; returns the existing job when one is `QUEUED`, `RUNNING`, or `DONE` with the same `bodyFitAt` and `fitDataHash`; otherwise throws `DeepFitError("You've used today's 5 tests")` when the buyer created 5 jobs in the last 24 h, else creates one.
  - `claimDeepFit(db, now)` and `runDeepFitJob(db, storage, run, job): Promise<"done" | "failed" | "retry">` — the same claim, 3 attempts and 10-minute stale rule as `body-fit-jobs.ts`. Garments are stored privately at `deep-fit/<userId>/<jobId>/<size>.glb`. On finish it notifies with id `deep-fit:<jobId>` and a link to the product. A result is discarded (job `FAILED`, error `"body changed"`) if the profile's `bodyFitAt` no longer equals the job's.
  - `getDeepFit(userId, productId)` → `{ status, tensions: Record<size, Record<region, number>>, garments: Record<size, url> } | null`, only for a job matching the current body and fit data.
  - `/api/fit-garment?job=<id>&size=<s>`: owner only, `private, no-store`, 404 otherwise.
  - `npm run sim:worker` (needs `BLENDER_BIN`); `--once` for tests.
  - Sweep step `deepFit`: deletes `DONE` jobs' files and rows 90 days after creation.

- [ ] **Step 1: Failing tests** (fake runner, as in `body-fit.int.test.ts`):
  - a sixth request within 24 h is refused with "You've used today's 5 tests"; a request for a product already tested returns the same job and does not count;
  - two workers claiming at once get different jobs;
  - a runner that throws three times leaves the job `FAILED` and notifies once;
  - the buyer rebuilds their body while the job runs: the result is discarded and `getDeepFit` returns null;
  - another buyer and a signed-out visitor get 404 from `/api/fit-garment`;
  - `deleteBody` removes the buyer's deep-fit files and jobs.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS). Commit.

### Task 6.6: Deep Fit Test on the product page

**Files:**
- Modify: `src/server/fit.ts` (`FitView`), `src/lib/fit/report.ts`, `src/lib/fit/report.test.ts`, `src/components/fit/fit-module.tsx`, `src/app/products/[id]/fit-section.tsx`, `docs/decisions.md` (record the two labels as a `UX-001` exception)
- Test: `src/lib/fit/report.test.ts`, `tests/e2e/deep-fit.spec.ts`

**Interfaces:**
- Consumes: `getDeepFit`, `requestDeepFit` (6.5).
- Produces:
  - `FitView.deepFit: { status: "none" | "queued" | "done" | "failed"; left: number } | null` (null unless the buyer has a confirmed body); when `done`, `body.garments` holds the buyer's own simulated garments and the report is built from the simulated tensions.
  - `buildReport(…, { simulated?: Record<size, Record<region, number>> })` — where a simulated tension exists it replaces the formula's value for that size and area; the recommended size is chosen as before.
  - UI: a button "Deep Fit Test" (disabled at `left === 0`), the status "Testing…" while queued, and the label "Simulated on your body" on the card when done. No other new text.

- [ ] **Step 1: Failing unit test** — with a simulated chest tension of 0.9 for size M, the M report's chest tension is 0.9 and its other areas keep the formula's values.
- [ ] **Step 2: Failing e2e** — Dilan presses "Deep Fit Test", sees "Testing…"; the test runs `sim:worker --once` with a fake runner; after reload the card shows "Simulated on your body" and a size switch changes the garment file requested.
- [ ] **Step 3–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** `npm run check`, `npm run test:int`, `npm run e2e`. Update `docs/implementation-status.md`, `DEC-021`, the agent brief and `docs/CHANGES.md`. Commit.

---

## Order, size and what each phase needs from the owner

| Phase | Rough size | Needs from the owner first |
|---|---|---|
| 1 Phone testing | half a day | a phone on the same Wi-Fi |
| 2 Accuracy | 2 days of code + the volunteer study | 10 or more volunteers and a tape measure |
| 3 Deployable worker | 3 days | a hosting choice and an object store (assumption A) |
| 4 Motions on own body | 4 days | nothing |
| 5 Anny mannequins | 3 days | agreement to drop the old mannequin files (D) |
| 6 Cloth simulation | 2 days spike, then about 3 weeks | permission to install Blender; go/no-go after the spike (E, F) |

Phases 4 and 5 do not depend on Phases 1–3 and can be built while the volunteer study runs. Phase 6 depends on 4 and 5.
