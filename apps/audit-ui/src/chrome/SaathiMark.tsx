import type { JSX } from "react";

/**
 * The Saathi mark: a toran — the tile-arch raised over an Indian doorway —
 * five tiles in five pigments, the door itself left as open paper. A gateway,
 * because that is literally what this product is; an arch, because an arch
 * is many pieces holding by leaning on each other. Solid fills: it must
 * carry its colour at 16px, and outlines cannot.
 */
const TILES: Array<{ x: number; y: number; c: string }> = [
  { x: 24, y: 10.5, c: "#E9A23B" }, // keystone, marigold: the sunrise at the top
  { x: 13.5, y: 21.5, c: "#1B857E" }, // peacock
  { x: 34.5, y: 21.5, c: "#D95B2B" }, // vermilion
  { x: 8, y: 35.5, c: "#363499" }, // indigo
  { x: 40, y: 35.5, c: "#B23A63" }, // madder
];

export function SaathiMark({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 44"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Positioning lives on the group so an animation on the rect can
          never override it (CSS transform beats an attribute transform). */}
      {TILES.map((t) => (
        <g
          key={`${t.x}-${t.y}`}
          transform={`translate(${t.x} ${t.y}) rotate(45)`}
        >
          <rect
            x={-6.9}
            y={-6.9}
            width={13.8}
            height={13.8}
            rx={3.6}
            fill={t.c}
          />
        </g>
      ))}
    </svg>
  );
}
