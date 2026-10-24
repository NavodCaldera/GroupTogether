import type { Landmark, View } from "../types";
import { positionPrompt, Stability, type Prompt } from "./guidance";

export const COUNTDOWN_MS = 3000;
/** A prompt must hold this long before it is spoken, so jitter isn't read out. */
export const ANNOUNCE_AFTER_MS = 600;
export const REPEAT_MS = 7000;

export interface LiveStep {
  prompt: Prompt;
  /** Seconds left before capture, while counting down. */
  count: number | null;
  /** The position is right (the skeleton turns green). */
  ok: boolean;
  /** Speak the prompt now. */
  announce: boolean;
  /** Take the photo now. */
  capture: boolean;
}

/**
 * Live mode for one view: position prompts, then a countdown while the position
 * holds, then capture once the person is still.
 */
export class LiveSession {
  private stability = new Stability();
  private countdownFrom: number | null = null;
  private shown: Prompt | null = null;
  private shownSince = 0;
  private announced: Prompt | null = null;
  private announcedAt = 0;

  constructor(private view: View) {}

  step(t: number, landmarks: Landmark[], people: number, aspect: number): LiveStep {
    let prompt = positionPrompt(this.view, landmarks, people, aspect);
    const ok = prompt === null;
    const still = ok && this.stability.push(t, landmarks, aspect);
    if (!ok) {
      this.stability.reset();
      this.countdownFrom = null;
    } else {
      this.countdownFrom ??= t;
    }

    let count: number | null = null;
    if (prompt === null) {
      const left = COUNTDOWN_MS - (t - this.countdownFrom!);
      if (left > 0) {
        prompt = "stay_still";
        count = Math.ceil(left / 1000);
      } else {
        prompt = still ? "capturing" : "stay_still";
      }
    }

    if (prompt !== this.shown) {
      this.shown = prompt;
      this.shownSince = t;
    }
    const urgent = prompt === "stay_still" || prompt === "capturing";
    const announce =
      prompt !== this.announced
        ? urgent || t - this.shownSince >= ANNOUNCE_AFTER_MS
        : !urgent && t - this.announcedAt > REPEAT_MS;
    if (announce) {
      this.announced = prompt;
      this.announcedAt = t;
    }

    return { prompt, count, ok, announce, capture: prompt === "capturing" };
  }
}
