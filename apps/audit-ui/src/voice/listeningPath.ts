// §5 — kolam geometry, pure. Same convention as kolam/thread.ts: the shape is
// a tested function over plain numbers, and React only draws the result.

export const THREAD_WIDTH = 104;
export const THREAD_HEIGHT = 22;

const MARGIN = 3;
/** Bulge at silence. Not zero: a dead-flat line reads as "broken", not "quiet". */
const FLOOR = 0.7;
/** Bulge added at full volume, in the same user units as the viewBox. */
const GAIN = 8.4;

/**
 * Radius of the circular arc through a chord of length `chord` with a
 * mid-height of `bulge`. Inverted on purpose: a loud sample means a *small*
 * radius and a fat arc, a silent one means a huge radius and a line that is
 * very nearly straight. So the thread relaxes into a resting kolam stroke
 * when nobody is speaking instead of jittering on the noise floor.
 */
export function arcRadius(chord: number, bulge: number): number {
  return (chord * chord) / (8 * bulge) + bulge / 2;
}

/**
 * One continuous stroke, alternating above and below the line — a kolam
 * thread being drawn, never a row of equaliser bars. Each arc is one real
 * amplitude sample, oldest at the left, so the wave travels the way the
 * sentence did.
 */
export function listeningPath(levels: readonly number[]): string {
  if (levels.length === 0) return "";
  const cy = THREAD_HEIGHT / 2;
  const chord = (THREAD_WIDTH - MARGIN * 2) / levels.length;
  const arcs = levels.map((level, i) => {
    const bulge = FLOOR + clamp(level) * GAIN;
    const r = arcRadius(chord, bulge).toFixed(2);
    const x = (MARGIN + chord * (i + 1)).toFixed(2);
    return `A ${r} ${r} 0 0 ${i % 2 === 0 ? 1 : 0} ${x} ${cy}`;
  });
  return `M ${MARGIN} ${cy} ${arcs.join(" ")}`;
}

/** The pulli the thread is drawn around — one dot per junction. */
export function pulliPoints(count: number): readonly number[] {
  const chord = (THREAD_WIDTH - MARGIN * 2) / count;
  return Array.from({ length: count + 1 }, (_, i) => MARGIN + chord * i);
}

function clamp(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(1, level));
}
