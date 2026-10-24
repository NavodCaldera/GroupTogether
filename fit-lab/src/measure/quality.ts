import { LM, type Issue, type Landmark, type Mask, type View } from "../types";
import { midpoint } from "./geometry";
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
  leaning: "Stand straight",
};

/** Issues that make a photo unusable rather than less accurate. */
export const BLOCKING: Issue[] = ["no_person", "not_full_body", "not_facing", "not_sideways"];

/** Checks from the pose and mask; image checks (blur, light) come from OpenCV. */
export function poseIssues(view: View, landmarks: Landmark[], mask: Mask, people: number): Issue[] {
  if (people === 0 || landmarks.length < 33) return ["no_person"];
  const issues: Issue[] = [];
  if (people > 1) issues.push("several_people");

  const ext = verticalExtent(mask);
  const ankles = Math.max(landmarks[LM.leftAnkle].visibility, landmarks[LM.rightAnkle].visibility);
  if (
    !ext ||
    landmarks[LM.nose].visibility < 0.5 ||
    ankles < 0.5 ||
    ext.top <= 1 ||
    ext.bottom >= mask.height - 2
  ) {
    issues.push("not_full_body");
  }
  const heightPx = ext ? ext.bottom - ext.top + 1 : 0;
  if (heightPx < 0.45 * mask.height) issues.push("too_small");

  const shoulder = midpoint(landmarks[LM.leftShoulder], landmarks[LM.rightShoulder]);
  const hip = midpoint(landmarks[LM.leftHip], landmarks[LM.rightHip]);
  const torso = hip.y - shoulder.y;
  const across =
    Math.abs(landmarks[LM.leftShoulder].x - landmarks[LM.rightShoulder].x) / Math.max(torso, 1);
  if (view === "front" && across < 0.45) issues.push("not_facing");
  if (view === "side" && across > 0.3) issues.push("not_sideways");

  const ankle = midpoint(landmarks[LM.leftAnkle], landmarks[LM.rightAnkle]);
  if (heightPx > 0 && Math.abs(shoulder.x - ankle.x) / heightPx > 0.06) issues.push("leaning");
  return issues;
}
