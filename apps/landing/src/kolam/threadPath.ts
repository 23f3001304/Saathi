/**
 * The margin thread: one vertical kolam line for the whole deed, tied in a
 * ring at each clause threshold. The pen travels down, loops the ring
 * (left semicircle, then right, a full circle), and continues straight
 * through its middle: the knot is drawn around the line the way a kolam
 * loops its pulli. Drawn by scroll; the reader's own progress lays the ink.
 */
export const THREAD_X = 38;
const RING_R = 9;

export function buildThreadPath(height: number, knots: number[]): string {
  const x = THREAD_X;
  const d2 = RING_R * 2;
  let d = `M ${x} 0`;
  for (const y of knots) {
    d += ` L ${x} ${y}`;
    d += ` a ${RING_R} ${RING_R} 0 0 0 0 ${d2}`;
    d += ` a ${RING_R} ${RING_R} 0 0 0 0 ${-d2}`;
    d += ` L ${x} ${y + d2}`;
  }
  d += ` L ${x} ${height}`;
  return d;
}

/** Ring centres, for the pulli dots that precede the line (dots first, then thread). */
export function knotCentres(knots: number[]): number[] {
  return knots.map((y) => y + RING_R);
}
