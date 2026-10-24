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
npm test             # unit tests (synthetic bodies, fit algorithm)
npm run build
```

`npm run setup` (run automatically before `dev` and `build`) copies the MediaPipe WASM
runtime and downloads the pose model (~30 MB) into `public/`. Both are gitignored. At run
time photos are processed in the browser and never leave the device.

## Pipeline

| Step                                                                                                                                                                      | Code                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Smartphone camera: front + side photos (camera with outline and timer, or upload) and known height                                                                        | [`ui/camera.ts`](src/ui/camera.ts), [`main.ts`](src/main.ts)                                           |
| MediaPipe Pose Landmarker (heavy): 33 landmarks + body segmentation mask                                                                                                  | [`vision/mediapipe.ts`](src/vision/mediapipe.ts)                                                       |
| OpenCV.js: mask cleanup (close, open, largest region filled), sharpness and brightness                                                                                    | [`vision/opencv.ts`](src/vision/opencv.ts)                                                             |
| Photo checks: no person, several people, full body, too far, facing / sideways, arms touching, leaning, blur, light                                                       | [`measure/quality.ts`](src/measure/quality.ts), [`vision/analyze.ts`](src/vision/analyze.ts)           |
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

Tested so far: unit tests on synthetic bodies, and the full pipeline in headless Chromium
with one non-standing sample photo (models load, checks fire). Real-person accuracy is
**not measured yet**.
