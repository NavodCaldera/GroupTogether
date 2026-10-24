# Fit lab

Experiment: estimate whether a buyer's body fits a garment, from typed measurements and
front, side and back photos with an A4 sheet as the scale reference. Standalone; not part
of the app. Supports the planned `FIT-001` / open `DEC-006`. Never promises exact fit.

## Inputs

1. **Known measurements.** Height required (also a scale reference). Optional: weight, chest,
   waist, hip, shoulder, sleeve, inseam. Typed tape values always beat photo estimates.
2. **Photos.** Front, side, back. Fitted clothes, full body in frame, phone vertical at waist
   height about 2.5 m away, plain background, A-pose for front and back, arms down for side.
   A4 held flat against the stomach facing the camera (same depth as the body).

## Pipeline

1. **A4 detection** (OpenCV.js): find the quad, check the 297 / 210 ratio, get mm per pixel
   and the camera tilt from the four corners. Fall back to height if the sheet is not found.
2. **Pose** (MediaPipe Pose Landmarker): shoulders, hips, knees, ankles, wrists, head.
3. **Silhouette** (MediaPipe segmentation): body mask.
4. **Measure:** widths at chest, waist and hip lines from the front and back masks, depths
   from the side mask; circumference from an ellipse (Ramanujan) of width × depth with a
   correction factor; shoulder, sleeve, torso length, inseam from landmarks. Height and A4
   scales cross-check each other; the gap is part of the confidence.
5. **Review:** show the lines on the photos so the buyer can correct a value.
6. **Fit:** compare body with garment measurements (not size labels) per size: ease =
   garment − body, judged against the ease range of the fit style (slim, regular, oversized).
   Result per dimension: tight, good, loose; then a suggested size.

## Privacy

Photos are processed in the browser and never uploaded; only numbers are kept, with the
buyer's consent and a delete option. No photos of children.

## Accuracy test

A few volunteers measured with a tape; compare photo estimates per dimension (target within
a few cm) and record the A4 vs height scale gap.

## Open

- Garment measurements per size: from factories, or we measure the test pieces we buy.
- Ease ranges per fit style and category.
- Browser prototype (TypeScript) vs a quick Python accuracy notebook first.
