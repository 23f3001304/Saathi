import type { CSSProperties, JSX } from "react";

/**
 * The Saathi mark, duplicated verbatim from audit-ui (apps never import
 * each other here): a toran, the tile-arch raised over an Indian doorway.
 * Five tiles in five pigments, the door itself left as open paper. A
 * gateway, because that is literally what this product is. Positioning
 * lives on the group so the tile-landing animation (on the rect, see
 * base.css .saathi-tile) can never override it.
 */
const TILES: Array<{ x: number; y: number; c: string }> = [
  { x: 24, y: 10.5, c: "#E9A23B" },
  { x: 13.5, y: 21.5, c: "#1B857E" },
  { x: 34.5, y: 21.5, c: "#D95B2B" },
  { x: 8, y: 35.5, c: "#363499" },
  { x: 40, y: 35.5, c: "#B23A63" },
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
      height={(size * 44) / 48}
      viewBox="0 0 48 44"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {TILES.map((t, i) => (
        <g
          key={`${t.x}-${t.y}`}
          transform={`translate(${t.x} ${t.y}) rotate(45)`}
        >
          <rect
            className="saathi-tile"
            style={{ "--i": i } as CSSProperties}
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
