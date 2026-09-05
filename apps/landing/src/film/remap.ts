/**
 * Film time is not choreography time.
 *
 * The script's `at` values were written against the built stage, where the
 * curtain, the walk and the night each take as long as they need. The film
 * is five scenes of eight seconds, so each scene owns exactly a fifth of
 * the scroll. This is the ruler between the two: the same story beats, laid
 * out on the film's even fifths, so a line still arrives on its own scene.
 */
import type { Line } from "../show/script.ts";
import { SCRIPT } from "../show/script.ts";

interface Knot {
  /** Where the beat sits in the choreography. */
  readonly from: number;
  /** Where the same beat sits in the film. */
  readonly to: number;
}

/* Curtain up; the word given; the walk; the tout; the bill and the night. */
const KNOTS: readonly Knot[] = [
  { from: 0, to: 0 },
  { from: 0.075, to: 0.2 },
  { from: 0.335, to: 0.4 },
  { from: 0.53, to: 0.6 },
  { from: 0.695, to: 0.8 },
  { from: 1, to: 1 },
];

/** Choreography progress to film progress, straight between the knots. */
export function remapAt(at: number): number {
  if (at <= 0) return 0;
  if (at >= 1) return 1;
  for (let i = 1; i < KNOTS.length; i += 1) {
    const hi = KNOTS[i];
    if (at > hi.from) continue;
    if (at === hi.from) return hi.to;
    const lo = KNOTS[i - 1];
    const k = (at - lo.from) / (hi.from - lo.from);
    return lo.to + k * (hi.to - lo.to);
  }
  return 1;
}

/** The same script, in the film's time. Built once, read everywhere. */
export const SCRIPT_FILM: readonly Line[] = SCRIPT.map((line) => ({
  ...line,
  at: remapAt(line.at),
}));
