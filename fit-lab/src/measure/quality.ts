import { LM, type Issue, type Landmark, type Mask, type View } from "../types";
import { poseFaults, type PoseFault } from "./pose";
import { verticalExtent } from "./silhouette";

export const ISSUE_LABEL: Record<Issue, string> = {
  no_person: "No person found",
  several_people: "More than one person",
  not_full_body: "Full body not in frame",
  too_small: "Too far away",
  blurry: "Blurry",
  too_dark: "Too dark",
  too_bright: "Too bright",
  not_facing: "Face the camera",
  not_sideways: "Turn sideways",
  arms_touching: "Arms touching the body",
  arms_not_down: "Arms not down",
  legs_together: "Feet together",
  wide_stance: "Feet too wide apart",
  unclear_outline: "Body outline unclear",
  leaning: "Stand straight",
};

/** Issues that make a photo unusable rather than less accurate. */
export const BLOCKING: Issue[] = [
  "no_person",
  "not_full_body",
  "not_facing",
  "not_sideways",
  "unclear_outline",
];

// Arms in, in a still, is judged from the mask (arms_touching), not from landmarks.
const FAULT_ISSUE: Record<PoseFault, Issue | null> = {
  core_hidden: "not_full_body",
  limbs_hidden: "not_full_body",
  not_facing: "not_facing",
  not_sideways: "not_sideways",
  arms_in: null,
  arms_not_down: "arms_not_down",
  feet_together: "legs_together",
  feet_wide: "wide_stance",
  leaning: "leaning",
};

/** Checks from the pose and mask; image checks (blur, light) come from OpenCV. */
export function poseIssues(
  view: View,
  landmarks: Landmark[],
  mask: Mask,
  people: number,
  turn: number | null = null,
): Issue[] {
  if (people === 0 || landmarks.length < 33) return ["no_person"];
  const issues = new Set<Issue>();
  if (people > 1) issues.add("several_people");

  const ext = verticalExtent(mask);
  if (
    !ext ||
    landmarks[LM.nose].visibility < 0.5 ||
    ext.top <= 1 ||
    ext.bottom >= mask.height - 2
  ) {
    issues.add("not_full_body");
  }
  const heightPx = ext ? ext.bottom - ext.top + 1 : 0;
  if (heightPx < 0.45 * mask.height) issues.add("too_small");

  for (const f of poseFaults(view, landmarks, turn)) {
    const issue = FAULT_ISSUE[f];
    if (issue) issues.add(issue);
  }
  return [...issues];
}
