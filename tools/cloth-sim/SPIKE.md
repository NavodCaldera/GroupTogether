# Spike: Blender cloth on a buyer's body (Task 6.1)

**Verdict: GO**, with two findings for Task 6.4 below. Finding 1 (tension saturates) is fixed:
see [Finding 1 fixed](#finding-1-fixed-2026-11-17). Measured 2026-11-16 on this machine
(16 cores, Blender 4.5.10 LTS, `-t 8`), other agents' work running alongside.

## Set-up

- Body: Dilan (172 cm, chest 100, waist 88, hip 98) fitted from his measurements with Anny
  (`Fitter.fit_measurements` + `write_body`, skinned, 13 718 vertices, 36 bones). Not committed
  (body files are private); regenerate it with the command at the end.
- Tee: the body's covered surface (chest, waist, hip, shoulder, upper arm; 1 957 vertices) pushed
  out by each area's room, at least 1 cm. A size smaller than the body gets its springs' rest
  shape taken in round the body (`garment.py`), which is what puts it in tension.
- Blender cloth: fabric of the crew tee (180 gsm, 5 % stretch, jersey), quality 5, collision
  quality 3, self-collision off, the body a one-sided collider animated per frame. Neckline
  pinned to the skinned tee, every other vertex pulled lightly (goal 0.2) towards it.
- Timeline (25 fps): 30 settle frames, then WALK and REACH from `motion.ts`, 40 frames each, each
  eased in from and out to the rest pose over 12 frames: 158 frames.
- Sizes: fit = crew tee M (chest 102, waist 98, upper arm 36); two sizes small (90 / 86 / 32);
  two sizes large (116 / 112 / 40).

Run: `"$BLENDER_BIN" -b --factory-startup -t 8 -P tools/cloth-sim/spike.py -- dilan.glb OUT fit small2 large2`

## Numbers

| | small (−2) | fit | large (+2) |
|---|---|---|---|
| Rest scale, chest | 0.836 | 0.947 | 1.007 |
| Cloth step in Blender, s | 125.7 | 113.7 | 66.6 |
| Whole spike run incl. its extra checks, s | 219 | 188 | 135 |
| `run.simulate`, one size, end to end, s | 313 † | 58.3 | 145.6 |
| Furthest garment vertex from the body, m | 0.086 | 0.091 | 0.073 |
| Vertices > 3 mm inside the skin, settled / worst frame | 0 % / 6.9 % | 0 % / 8.9 % | 0 % / 2.9 % |
| Chest strain, settled | 0.070 | 0.023 | −0.003 |
| **Mean chest strain over the motions** | **0.177** | **0.111** | **0.012** |
| Tension (chest, waist, hip, upper arm, shoulder) | 1, 1, 0.71, 1, 1 | 1, 1, 0.35, 1, 1 | 0.71, 0.07, 0.04, 1, 1 |

† Same input as the spike's 126 s cloth step; measured while other agents loaded the machine
(its first run, during a session restart, took 752 s). The tight size is the slowest: most
contacts.

## Against the go criteria

| Criterion | Result |
|---|---|
| One size under 3 min on 8 cores | Met: every size's cloth step 67–126 s; fit end to end 58 s. The tight size end to end ranged 126–313 s with load. |
| No size explodes (no vertex > 0.5 m from the body) | Met: worst 0.091 m, all positions finite. |
| Mean chest strain small > fit > large | Met: 0.177 > 0.111 > 0.012. |

## Findings for Task 6.4

1. **Tension saturates in motion.** Upper arm and shoulder read 1.0 for every size, and the fit
   size's chest reads 1.0: the 95th-percentile strain over WALK is far above the 10 % capacity
   (5 % stretch + 0.05). The shell is the skin offset outwards, so the sleeve has no slack under
   the arm, and WALK lowers the arms 35° into the side. The settled strain is ordered and sensible
   (0.070 / 0.023 / −0.003). Before buyers see simulated tensions, either add underarm ease to the
   shell or calibrate the mapping (e.g. per-motion percentiles, or capacity from wear trials).
2. **What did not work, for the record.** Shrinking rest lengths with Blender's per-vertex shrink
   drove tight sizes through the body (up to 90 % of vertices inside) or made the tee ride up off
   the shoulders; more substeps (15 / collision 10) did not fix it. What fixed it: a rest shape
   taken in round the body only (lengths kept, yoke kept), a one-sided collider, the neckline
   pinned, a soft goal everywhere, and easing into each clip (WALK's first pose drops the arms
   35° in one frame otherwise).

The production tool (Task 6.2: `run.py`, `simulate.py`, `garment.py`) uses exactly this set-up;
the spike drives the same modules inside Blender and adds the inside-the-skin check.

Regenerate the body (Anny environment):

```sh
python -c "import sys; sys.path.insert(0,'tools/body-fitting'); from fit import Fitter, write_body; f=Fitter(); write_body(f, f.fit_measurements(172, 0, {'chest':100,'waist':88,'hip':98}), 'dilan.glb')"
```

## Finding 1 fixed (2026-11-17)

Three causes, three changes (README "How it works" has the full rule):

1. **The cloth was held off the skin by the collider.** Body thickness + collision distance
   (0.9 cm) add 5.7 cm round the body, so Dilan in M (chest 102 on 101.3) was stretched 5 % just
   standing. The rest shape is now let out by the same 0.9 cm. The soft goal pulled towards the
   pushed-out shell, which kept loose areas in tension too; it now pulls towards `drape` (the rest
   shape, kept 1 cm off the skin).
2. **Cloth wound up on the arms and stayed.** Skin friction 5 → 0.5, pin stiffness 5 → 30, soft
   goal 0.2 → 0.5: in the old run the fit's chest strain grew from 0.04 to 0.6 over the motions and
   never relaxed; now it returns at every rest pose.
3. **What is measured.** Strain beyond the skin's own stretch (an edge's reference stretches with
   the skin under it); rim vertices and cloth squeezed between an arm and the torso (2.5 cm of
   both) are left out. Strain alone reads zero for any unstretched cloth, so tension is the higher
   of the strain reading and a slack reading `0.6 × exp(−room / looseAt)` from the chart's room on
   this body with the app's `snugFrom` and `looseAt`. A top's hem is held at the chart's waist when
   the chart has no hip.

Crew tee on Dilan, `run.simulate` one size per call, 8 threads, end to end (s):

| Size | Motions | Chest | Waist | Hip | Upper arm | Shoulder | s |
|---|---|---|---|---|---|---|---|
| Two small (90 / 86) | WALK, REACH | 0.886 | 0.600 | 0.591 | 0.600 | 0.194 | 42.7 |
| M, the fit (102 / 98) | WALK, REACH | 0.573 | 0.325 | 0.251 | 0.406 | 0.178 | 37.4 |
| Two large, XL (116 / 112) | WALK, REACH | 0.239 | 0.150 | 0.092 | 0.272 | 0.164 | 35.2 |
| Two small | all four | 0.875 | 0.600 | 0.591 | 0.600 | 0.131 | 81.0 |
| M | all four | 0.573 | 0.325 | 0.251 | 0.406 | 0.122 | 74.6 |
| XL | all four | 0.239 | 0.150 | 0.092 | 0.272 | 0.116 | 67.4 |

Lead's criteria, all met and pinned by `test_crew_tee_on_dilan_reads_fit_tight_and_loose_the_same_twice`
(blender + anny): M chest, waist, hip in 0.15–0.6 and upper arm, shoulder ≤ 0.7; two small chest
≥ 0.8; two large chest, waist, hip ≤ 0.25; small ≥ fit ≥ large in every area; two runs within
0.05 (they agreed to the third decimal). Margins to watch on other bodies: XL chest 0.239 against
0.25 (that value is the slack side, from the chart), and the shoulder ordering (0.13 / 0.12 / 0.12).
Two small reads 0.6 at waist and upper arm because those are the slack side's "no room" value:
the chart leaves −1.0 and −0.1 cm there, touching, not stretched.

## Loose sizes read tight on the first batch (2026-11-17)

The first real batch (crew tee, 10 men shapes × S/M/L/XL, all four motions) read loose cloth as
tight: men-03 XL (chest 13 cm of room) read chest and waist 1.0, and several shapes read XL
tighter than L. The strain side fired, mostly in WALK, RUN and SIT, the motions with the arms
down at the sides.

**Cause.** The pins and the soft goal pull the cloth towards the drape carried by the skin, and
skinning carries torso cloth with the torso. When an arm swings down against the side, the
skinned drape of the tee's side lies inside the arm: on men-03 XL in WALK about 100 of the torso's
drape vertices were inside the arm in every frame of the clip (0 standing). The goal pulled that
cloth into the arm, the one-sided collider pushed it back out, and the cloth was stretched round
the arm (vertices up to 7 cm from where the skin carries them, single edges at 5× their rest
length). The strained chest vertices were all at the side under the arm (|x| ≈ 0.19 m), 95 % of
them within 5 cm of the arm. A looser size hangs further out, so more of it lies in the arm's
way: hence XL tighter than L. Turning the goal off was worse (cloth wound up on the arms, as in
the spike).

**Fix.** `run.clear_of_limbs`: every frame, each drape vertex that lies inside (or within 1 cm
of) a body part that does not carry it is moved out along that part's skin normal to 1 cm off it:
torso cloth off the arms, a sleeve off the torso and the other arm. Only the depth beyond what the
vertex had standing is moved, so the rest pose and the settled garment are unchanged. The strain's
reference already follows the drape, so the push itself is not counted as stretch. Pinned by
`test_the_drape_is_kept_out_of_an_arm_swinging_down_against_the_side` (numpy) and
`test_a_loose_crew_tee_reads_loose_while_the_arms_swing` (Blender, men-03 XL, WALK).

men-03 XL, WALK alone: chest 1.0 → 0.27, waist 1.0 → 0.15. men-03 L: chest 0.54 → 0.44 (now the
slack side, 5 cm of room). Dilan's criteria test still passes.

Crew tee batch on the 10 men shapes after the fix (`batch.py`, all four motions, 40 sizes, 86 min
with `--parallel 2`, mean 252 s per size per process; before the fix 96–104 s, unloaded). Chest /
waist / upper arm, S / M / L / XL:

| Shape | Chest | Waist | Upper arm |
|---|---|---|---|
| men-01 | 0.38 / 0.26 / 0.18 / 0.13 | 0.22 / 0.16 / 0.12 / 0.13 | 0.29 / 0.24 / 0.20 / 0.16 |
| men-02 | 0.53 / 0.36 / 0.25 / 0.22 | 0.37 / 0.27 / 0.19 / 0.17 | 0.41 / 0.34 / 0.28 / 0.23 |
| men-03 | 0.94 / 0.60 / 0.44 / 0.27 | 0.44 / 0.32 / 0.23 / 0.19 | 1.00 / 1.00 / 1.00 / 1.00 |
| men-04 | 0.32 / 0.22 / 0.15 / 0.10 | 0.15 / 0.11 / 0.10 / 0.10 | 0.20 / 0.17 / 0.14 / 0.11 |
| men-05 | 1.00 / 1.00 / 0.60 / 0.43 | 1.00 / 1.00 / 0.60 / 0.47 | 1.00 / 0.94 / 0.55 / 0.38 |
| men-06 | 0.43 / 0.29 / 0.20 / 0.12 | 0.28 / 0.20 / 0.15 / 0.10 | 0.27 / 0.22 / 0.18 / 0.15 |
| men-07 | 0.60 / 0.44 / 0.31 / 0.19 | 0.41 / 0.30 / 0.21 / 0.14 | 0.52 / 0.42 / 0.35 / 0.28 |
| men-08 | 1.00 / 1.00 / 1.00 / 0.60 | 1.00 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 |
| men-09 | 0.95 / 0.60 / 0.48 / 0.29 | 0.48 / 0.34 / 0.24 / 0.16 | 1.00 / 1.00 / 1.00 / 0.87 |
| men-10 | 0.56 / 0.39 / 0.27 / 0.16 | 0.31 / 0.22 / 0.16 / 0.10 | 0.39 / 0.32 / 0.26 / 0.22 |

Every area of every shape now reads S ≥ M ≥ L ≥ XL (before: 11 inversions), and all 94 areas with
6 cm or more of room on the body file read ≤ 0.5. Two things the fix does not change:

- men-03 and men-09 read a tight sleeve in every size because their body files' upper arms are
  41.9 and 39.5 cm (listed 32.2 and 32.6): the room is measured on the body file.
- A size a little under the body reads the slack side's 0.6, not tight: men-05 L (chest 108 on a
  110.6 body file, 109.7 listed) reads 0.60, as before the fix. 2.4 % under the body is within the
  jersey's 5 % stretch, so its strain (≈ 0.02 against a 0.10 capacity) stays below the slack side.

