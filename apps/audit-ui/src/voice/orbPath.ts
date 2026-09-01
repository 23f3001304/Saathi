// §5 — kolam geometry, pure. Same convention as listeningPath.ts: the shape
// is a tested function over plain numbers and React only draws the result.

export type OrbPoint = { readonly x: number; readonly y: number };

/** User units of the orb's viewBox; the CSS size is independent of this. */
export const ORB_SIZE = 240;

export type OrbGeometry = {
  readonly cx: number;
  readonly cy: number;
  /** Radius at silence. The bloom is a ring before it is a waveform. */
  readonly base: number;
  /** Added radius at full volume, in the same user units as the viewBox. */
  readonly reach: number;
};

const TAU = Math.PI * 2;

/**
 * The amplitude window is mirrored around the ring rather than wrapped, so
 * the first and last sample meet their own neighbours and the bloom closes
 * without a seam. A wrapped window would put the oldest sample next to the
 * newest and leave a permanent kink at one o'clock.
 */
export function petalCount(samples: number): number {
  return Math.max(3, (samples - 1) * 2);
}

export function petalLevels(levels: readonly number[]): readonly number[] {
  const samples = levels.length;
  if (samples < 2) return levels.map(clamp);
  const petals = petalCount(samples);
  return Array.from({ length: petals }, (_, i) =>
    clamp(levels[i < samples ? i : petals - i]),
  );
}

export function bloomPoints(
  levels: readonly number[],
  geometry: OrbGeometry,
): readonly OrbPoint[] {
  const petals = petalLevels(levels);
  return petals.map((level, i) => {
    // Quarter-turn back, so the deepest petal sits at the top of the form.
    const angle = (i / petals.length) * TAU - Math.PI / 2;
    const radius = geometry.base + level * geometry.reach;
    return {
      x: geometry.cx + radius * Math.cos(angle),
      y: geometry.cy + radius * Math.sin(angle),
    };
  });
}

/**
 * One closed stroke through every point — a Catmull-Rom spline written out as
 * cubics, which is what keeps the form a drawn kolam line rather than a
 * polygon with the corners knocked off.
 */
export function closedCurve(points: readonly OrbPoint[]): string {
  const count = points.length;
  if (count < 3) return "";
  const at = (i: number): OrbPoint => points[((i % count) + count) % count];
  let d = `M ${place(at(0))}`;
  for (let i = 0; i < count; i++) {
    d += ` C ${place(lead(at(i), at(i + 1), at(i - 1)))} ${place(
      lead(at(i + 1), at(i), at(i + 2)),
    )} ${place(at(i + 1))}`;
  }
  return `${d} Z`;
}

export function bloomPath(
  levels: readonly number[],
  geometry: OrbGeometry,
): string {
  return closedCurve(bloomPoints(levels, geometry));
}

/** The pulli the bloom is drawn around — one dot per petal, on a plain ring. */
export function pulliRing(
  count: number,
  cx: number,
  cy: number,
  radius: number,
): readonly OrbPoint[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const angle = (i / count) * TAU - Math.PI / 2;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

/** One sixth of the span between the neighbours: the standard tangent scale. */
function lead(from: OrbPoint, toward: OrbPoint, away: OrbPoint): OrbPoint {
  return {
    x: from.x + (toward.x - away.x) / 6,
    y: from.y + (toward.y - away.y) / 6,
  };
}

function place(point: OrbPoint): string {
  return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
}

function clamp(level: number | undefined): number {
  if (level === undefined || !Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(1, level));
}
