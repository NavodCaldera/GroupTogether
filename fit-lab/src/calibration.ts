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

  /** Shoulder landmarks sit at the joints; a tape across the back is wider. */
  shoulderFactor: 1.2,
  armFactor: 1.0,
  /** Hip landmark (joint) to crotch. */
  crotchDropCm: 10,

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
  typedSd: 1,
  garmentSd: 1,
  /** Each photo issue multiplies the standard deviation by 1 + this. */
  issuePenalty: 0.5,

  /** Share of a fabric's stretch % of the body counted as extra ease on circumferences. */
  stretchUse: 1,
};
