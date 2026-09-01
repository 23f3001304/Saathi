import type { JSX } from "react";

/**
 * A product plate: a woven mark derived from the SKU, not a photograph.
 *
 * This is now the fallback rather than the only option. A merchant can give a
 * listing an image URL, and where they have, `ProductImage` shows their
 * picture. Where they have not — or where the link is dead — inventing a photo
 * for a thing we have never seen would still be the same confident fiction the
 * write gate exists to refuse, so the SKU gets a deterministic Truchet weave
 * instead: the same over-under language as the kolam thread, in one of five
 * muted grounds. Same SKU, same plate, every render and every machine.
 */

// Pigments, not pastels: marigold, peacock, vermilion, indigo and madder —
// the colours an Indian textile market actually runs on. Each SKU lands on
// one deterministically, so the row of cards reads as a dyer's shelf.
const GROUNDS = [
  { wash: "#F6E3C2", line: "#B4791B" },
  { wash: "#D9EAE6", line: "#14706A" },
  { wash: "#F7DDD2", line: "#B4441A" },
  { wash: "#E0DEF2", line: "#363499" },
  { wash: "#F5DAE2", line: "#A02D55" },
] as const;

const COLS = 10;
const ROWS = 4;
const CELL = 24;

function fnv1a(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** Two quarter-arcs per cell; the seed bit decides which diagonal they hug. */
function cellArcs(col: number, row: number, flipped: boolean): string {
  const x = col * CELL;
  const y = row * CELL;
  const r = CELL / 2;
  if (flipped) {
    return `M${x} ${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} M${x + r} ${y + CELL} A${r} ${r} 0 0 1 ${x + CELL} ${y + r}`;
  }
  return `M${x + r} ${y} A${r} ${r} 0 0 1 ${x + CELL} ${y + r} M${x} ${y + r} A${r} ${r} 0 0 1 ${x + r} ${y + CELL}`;
}

function weave(seed: number): string {
  const parts: string[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const bit = (seed >>> ((row * COLS + col) % 30)) & 1;
      parts.push(cellArcs(col, row, bit === 1));
    }
  }
  return parts.join(" ");
}

export type ProductPlateProps = {
  sku: string;
  className?: string;
};

export function ProductPlate({
  sku,
  className,
}: ProductPlateProps): JSX.Element {
  const seed = fnv1a(sku);
  const ground = GROUNDS[seed % GROUNDS.length] ?? GROUNDS[0];

  return (
    <svg
      className={className}
      viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={COLS * CELL} height={ROWS * CELL} fill={ground.wash} />
      <path
        d={weave(seed)}
        fill="none"
        stroke={ground.line}
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.62}
      />
    </svg>
  );
}
