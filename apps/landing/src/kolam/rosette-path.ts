// The covenant seal's geometry, duplicated verbatim from
// apps/audit-ui/src/kolam/rosette-path.ts: one continuous kolam line around
// a 3x3 pulli grid. Duplicated rather than imported because apps are leaf
// composition roots in this workspace and never import each other.
type Pt = { x: number; y: number };
type Arc = { entry: Pt; exit: Pt; dir: Pt; sweep: 0 | 1 };

const ROSETTE_ORDER: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [0, 1],
  [0, 2],
  [1, 2],
  [2, 2],
];

function normalize(v: Pt): Pt {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function computeArcs(cx: number, cy: number, pitch: number, r: number): Arc[] {
  const n = ROSETTE_ORDER.length;
  const points = ROSETTE_ORDER.map(([gx, gy]) => ({
    x: cx + (gx - 1) * pitch,
    y: cy + (gy - 1) * pitch,
  }));
  return points.map((center, i) => {
    const next = points[(i + 1) % n] ?? center;
    const dir = normalize({ x: next.x - center.x, y: next.y - center.y });
    const perp = { x: dir.y, y: -dir.x };
    const s = i % 2 === 0 ? 1 : -1;
    const entry = {
      x: center.x - s * 0.5 * r * perp.x - 0.866 * r * dir.x,
      y: center.y - s * 0.5 * r * perp.y - 0.866 * r * dir.y,
    };
    const exit = {
      x: center.x - s * 0.5 * r * perp.x + 0.866 * r * dir.x,
      y: center.y - s * 0.5 * r * perp.y + 0.866 * r * dir.y,
    };
    return { entry, exit, dir, sweep: (s > 0 ? 1 : 0) as 0 | 1 };
  });
}

/** One path, one stroke-dashoffset, no lifting of the hand. */
export function buildRosette(
  cx: number,
  cy: number,
  pitch = 22,
  r = 8,
): string {
  const arcs = computeArcs(cx, cy, pitch, r);
  const h = (pitch - 1.732 * r) / 2;
  let d = "";
  for (let i = 0; i < arcs.length; i++) {
    const arc = arcs[i];
    const next = arcs[(i + 1) % arcs.length];
    if (arc === undefined || next === undefined) continue;
    if (i === 0) d += `M ${arc.entry.x} ${arc.entry.y}`;
    d += ` A ${r} ${r} 0 1 ${arc.sweep} ${arc.exit.x} ${arc.exit.y}`;
    const h1 = { x: arc.exit.x + h * arc.dir.x, y: arc.exit.y + h * arc.dir.y };
    const h2 = {
      x: next.entry.x - h * arc.dir.x,
      y: next.entry.y - h * arc.dir.y,
    };
    d += ` C ${h1.x} ${h1.y} ${h2.x} ${h2.y} ${next.entry.x} ${next.entry.y}`;
  }
  return `${d} Z`;
}
