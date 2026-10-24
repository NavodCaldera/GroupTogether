# Fit lab

Experiment: estimate whether a buyer's body fits a garment from their known height, any
tape measurements they know, and a front and a side photo. Standalone; not part of the
GroupBasket app. Supports the planned `FIT-001` / open `DEC-006`. It never promises an
exact fit.

## Run

```sh
cd fit-lab
npm install
npm run dev          # http://localhost:5180
npm run dev:phone    # HTTPS on the network, for a phone camera (accept the certificate warning)
npm test             # unit tests (synthetic bodies, live guidance, fit algorithm)
npm run build
```

`npm run setup` (run automatically before `dev` and `build`) copies the MediaPipe WASM
runtime and downloads the pose models (lite ~6 MB for live, heavy ~30 MB for stills) into
`public/`. Both are gitignored. At run
time photos are processed in the browser and never leave the device.

## Camera and UI

TypeScript + React, with the browser's own camera APIs: `getUserMedia()` for the local
camera (no WebRTC connection), a `<video>` for the live image, canvas overlays for the
guide, skeleton and measurement lines, and `requestVideoFrameCallback()` (falling back to
`requestAnimationFrame`) to analyse each new frame.

Capture sequence ([`ui/CaptureFlow.tsx`](src/ui/CaptureFlow.tsx)):

```text
Camera permission → Front instructions → check position and stability → capture front
→ review or retake → Side instructions → check position and stability → capture side
→ review or retake
```

- **Live mode** (light): frames scaled to 384 px wide go to the lite pose model, one frame in
  flight at a time. Prompts, shown large and spoken (Voice on/off): _Step into the frame,
  Only one person in view, Move back, Keep your whole body visible, Move closer, Move to
  the centre, Face the camera, Turn sideways, Hold your arms slightly out, Stand straight,
  Stay still, Capturing now_. Once the position holds, a 3 s countdown runs; the photo is
  taken when the person is also still ([`live/guidance.ts`](src/live/guidance.ts),
  [`live/session.ts`](src/live/session.ts)). **Capture** takes the photo by hand.
- **Capture mode** (careful): the chosen still frame (up to 1280 px) goes through the heavy
  model with the body mask, OpenCV cleanup and quality checks, then the person reviews it
  with the measured lines drawn on and chooses **Use photo** or **Retake**. A photo with a
  blocking problem (no person, not full body, wrong view) can't be used.
- **Web Worker:** both modes run in [`vision/worker.ts`](src/vision/worker.ts) on
  OffscreenCanvas and ImageBitmap; [`vision/client.ts`](src/vision/client.ts) falls back to
  the main thread if the worker or MediaPipe can't start there.
- Uploading a photo still works for both views.

## Pipeline

| Step                                                                                                                                                                      | Code                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Smartphone camera and UI (above), and known height                                                                                                                        | [`ui/`](src/ui)                                                                                        |
| MediaPipe Pose Landmarker: lite in video mode for live frames; heavy with the body segmentation mask for stills                                                           | [`vision/mediapipe.ts`](src/vision/mediapipe.ts), [`vision/engine.ts`](src/vision/engine.ts)           |
| OpenCV.js: mask cleanup (close, open, largest region filled), sharpness and brightness                                                                                    | [`vision/opencv.ts`](src/vision/opencv.ts)                                                             |
| Photo checks: no person, several people, full body, too far, facing / sideways, arms touching, leaning, blur, light                                                       | [`measure/quality.ts`](src/measure/quality.ts), [`vision/engine.ts`](src/vision/engine.ts)             |
| Body measurement estimator: scale from height; widths (front) and depths (side) at chest, waist, hip; ellipse circumferences; shoulder, arm, torso, inseam from landmarks | [`measure/estimate.ts`](src/measure/estimate.ts), [`measure/silhouette.ts`](src/measure/silhouette.ts) |
| Garment measurement database: sizes with chest, waist, hip, shoulder, sleeve, length, inseam; category, fit style, fabric stretch                                         | [`garments/database.ts`](src/garments/database.ts)                                                     |
| Fit prediction: ease = garment − body (+ stretch), against ease bands per category and fit style, over the measurement uncertainty                                        | [`fit/ease.ts`](src/fit/ease.ts), [`fit/predict.ts`](src/fit/predict.ts)                               |
| Recommended size, possible tight / loose areas, fit confidence, limitations                                                                                               | [`fit/predict.ts`](src/fit/predict.ts), [`fit/limitations.ts`](src/fit/limitations.ts)                 |

### Measuring

- **Scale:** known height ÷ the mask's pixel height, per photo.
- **Rows:** chest at 28% of shoulder line → hip line; waist = narrowest torso row in 45–80%
  (front), reused in the side photo; hip = widest row around the hip line.
- **Circumference:** Ramanujan ellipse of front width × side depth, times a per-site factor.
- **Uncertainty:** each estimate has a standard deviation; every photo issue widens it.
  Typed values always win; a typed value far from the photo estimate is flagged.

### Choosing a size

For each size and measurement, the ease is compared with bands (too tight, snug, good,
roomy, too loose; short/long for lengths). The expected penalty is averaged over the
measurement's uncertainty, with tight costing twice as much as loose, and weighted (chest
and shoulder for tops; waist and hip for bottoms). The lowest penalty wins. Fit confidence
is the probability every compared measurement is wearable, lowered for missing ones.

## Not decided — starting values

- [`calibration.ts`](src/calibration.ts) (row positions, shoulder and circumference factors,
  crotch drop, standard deviations) and [`fit/ease.ts`](src/fit/ease.ts) (ease bands) are
  starting guesses.
- The garments in [`garments/database.ts`](src/garments/database.ts) are made-up samples.
  Real charts must come from factories or from measuring the test pieces we buy.
- The A4 reference was left out: holding it against the body breaks the arms-away pose, and
  height alone gives the scale. It can be added back as a scale cross-check.
- No back photo yet.

## Accuracy test

1. Tape-measure a few volunteers (height, shoulder, chest, waist, hip, arm, inseam) in
   fitted clothes.
2. Take their front and side photos in the lab; note the photo estimate for each measurement.
3. Fit `calibration.ts` factors so the mean error per measurement is near zero, and set
   `CAL.sd` to the observed spread.
4. Record which sizes they actually wear for the sample garments, and tune the ease bands.

Tested so far: unit tests on synthetic bodies and on the live guidance and countdown, and
the capture sequence in headless Chromium with a fake camera showing one non-standing
sample photo (worker starts, live prompts, manual capture, review, retake, blocked side
photo). Automatic capture of a real standing person and real-person accuracy are **not
tested yet**.
