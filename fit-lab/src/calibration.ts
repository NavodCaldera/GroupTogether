// Starting values, not measured truth. Tune them against tape-measured volunteers
// (see README, "Accuracy test") before trusting any estimate.
export const CAL = {
  /** Chest line, as a fraction of the way from the shoulder line to the hip line. */
  chestAt: 0.28,
  /** Rows searched for the narrowest torso width (waist), same fractions. */
  waistBand: [0.45, 0.8] as [number, number],
  /** Rows searched for the widest width (hip), as fractions of torso length around the hip line. */
  hipBand: [-0.1, 0.25] as [number, number],
  /** Used when there is no front photo to find the waist row. */
  waistAtDefault: 0.62,

  /** Shoulder outline row, as a fraction of torso length below the shoulder landmarks. */
  shoulderRowAt: 0.05,
  /** The outline across the deltoids is a little wider than a tape across the back. */
  shoulderOutlineFactor: 0.95,
  /** An outline wider than this many shoulder-landmark widths means the arms are raised into it. */
  shoulderOutlineMax: 1.6,
  /** Fallbacks from joint positions, used only when the outline can't be read. */
  shoulderJointFactor: 1.2,
  armFactor: 1.0,
  /** Hip landmark (joint) to crotch, for the joint fallback of the inseam. */
  crotchDropCm: 10,
  /** The hip search stops this far from the hip line towards the knees. */
  hipToKneeLimit: 0.5,

  /** A torso cross-section is fuller than an ellipse of the same width and depth. */
  circumference: { chest: 1.06, waist: 1.02, hip: 1.03 },

  /** One standard deviation of a photo estimate in a clean photo, cm. */
  sd: {
    chest: 3,
    waist: 3.5,
    hip: 3,
    shoulder: 2,
    sleeve: 2.5,
    torso: 2.5,
    inseam: 2.5,
    height: 0,
  },
  /** Joint-position estimates are not validated as sizes: widen their spread. */
  jointsSdFactor: 1.5,
  typedSd: 1,
  garmentSd: 1,
  /** Each photo issue multiplies the standard deviation by 1 + this. */
  issuePenalty: 0.5,

  /** Person mask from MediaPipe's probabilities. Test thresholds against tape measurements. */
  mask: {
    threshold: 0.5,
    /** Thresholds the model test compares. */
    testThresholds: [0.3, 0.4, 0.5, 0.6, 0.7],
    /** Opening/closing kernel, px: small, because cleanup moves the boundary. */
    kernel: 3,
    /** Enclosed gaps at least this share of the image are real (between arm and body, legs) and kept. */
    minGap: 0.0005,
    /** Outline spread (0.3 vs 0.7 threshold) above this rejects the photo as unclear. */
    spreadMax: 0.08,
    spreadThresholds: [0.3, 0.7] as [number, number],
  },

  /** Share of a fabric's stretch % of the body counted as extra ease on circumferences. */
  stretchUse: 1,
};
