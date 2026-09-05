import type { Line, Speaker } from "./script.ts";
import type { ObjectId } from "./contract.ts";

/*
 * Which line is being spoken at this scroll position, and where the seal
 * belongs. A line holds the screen for about as long as it takes to say
 * (its own seconds, in scroll), plus a breath, and never past the line
 * after it: two speech bubbles on screen at once would read as an argument.
 */

/** Scroll travelled per second of speech, plus the breath after a line. */
const PER_SECOND = 0.012;
const BREATH = 0.015;

export function lineEnd(script: readonly Line[], i: number): number {
  const line = script[i];
  const own = line.at + line.seconds * PER_SECOND + BREATH;
  const next = i + 1 < script.length ? script[i + 1].at : Number.POSITIVE_INFINITY;
  return Math.min(own, next);
}

/** The last line that has begun, if it is still holding the screen. */
export function activeIndex(script: readonly Line[], progress: number): number {
  for (let i = script.length - 1; i >= 0; i -= 1) {
    if (progress < script[i].at) continue;
    return progress < lineEnd(script, i) ? i : -1;
  }
  return -1;
}

/** The puppet who says it, or null for the narrator, who has no mouth. */
export function puppetOf(speaker: Speaker): ObjectId | null {
  return speaker === "narrator" ? null : speaker;
}

export interface SealWindow {
  readonly from: number;
  readonly to: number;
  readonly voice: string;
}

/* The seal stands between the line where the word is given and the line
   after it. The script names that line, and it has carried three names
   across drafts; the first one the script actually has wins, so a rename in
   the story cannot silently drop the one gesture on the page. */
const SEAL_IDS = ["word-saathi", "saathi-hold", "saathi-word"];

export function sealWindow(script: readonly Line[]): SealWindow | null {
  for (const id of SEAL_IDS) {
    const i = script.findIndex((line) => line.id === id);
    if (i < 0) continue;
    const next = i + 1 < script.length ? script[i + 1].at : 1;
    return { from: script[i].at, to: next, voice: script[i].voice };
  }
  return null;
}

/** The tout's tries, in the order he makes them. */
export function toutStems(script: readonly Line[]): readonly string[] {
  const stems = script.filter((l) => l.speaker === "tout").map((l) => l.voice);
  return stems.length > 0
    ? stems
    : ["tout-refusal", "tout-again-1", "tout-again-2"];
}
