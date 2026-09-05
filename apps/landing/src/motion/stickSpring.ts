/** A rod puppet followed by a hand: position and velocity in percent of
 *  the stage width and percent per second. */
export interface Spring {
  readonly x: number;
  readonly v: number;
}

/* Underdamped on purpose (damping ratio about 0.87): the puppet passes the
   hand once and comes back, which is what a stick held from below does. The
   ratio is higher than a textbook "bouncy" spring because this integrates
   with a fixed semi-implicit Euler step at the browser's own frame rate;
   0.6-0.7 rings for several visible cycles at 16 ms steps, so 0.87 is the
   lowest damping that still overshoots exactly once before settling. A
   frame longer than 48 ms is treated as 48 ms so a tab returning from the
   background cannot fling the puppet off the stage. */
const STIFFNESS = 120;
const DAMPING = 19;
const MAX_STEP_MS = 48;

export function step(s: Spring, target: number, dtMs: number): Spring {
  const dt = Math.min(Math.max(dtMs, 0), MAX_STEP_MS) / 1000;
  const a = STIFFNESS * (target - s.x) - DAMPING * s.v;
  const v = s.v + a * dt;
  return { x: s.x + v * dt, v };
}

export function settled(s: Spring, target: number): boolean {
  return Math.abs(target - s.x) < 0.05 && Math.abs(s.v) < 0.5;
}

/** Degrees of lean, from velocity, capped so the figure never falls over. */
export function tilt(v: number): number {
  return Math.max(-9, Math.min(9, v * 0.12));
}
