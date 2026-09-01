import type { JSX } from "react";

export type GlyphName =
  | "hexagon"
  | "chain"
  | "shield"
  | "inspect"
  | "chevron"
  | "replay"
  | "check"
  | "cross"
  | "flag"
  | "range";

type GlyphProps = {
  name: GlyphName;
  size?: number;
};

// Hand-cut 16px paths (ARCHITECTURE §11 signature move 5) — no icon package.
const PATHS: Record<GlyphName, JSX.Element> = {
  hexagon: <path d="M8 1 14 4.5 14 11.5 8 15 2 11.5 2 4.5Z" />,
  chain: (
    <>
      <rect x="2" y="6" width="6" height="4" rx="2" />
      <rect x="8" y="6" width="6" height="4" rx="2" />
    </>
  ),
  shield: <path d="M8 1 14 3.5V8c0 4-2.5 6-6 7-3.5-1-6-3-6-7V3.5Z" />,
  inspect: (
    <>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  chevron: <path d="M4 10 8 6 12 10" />,
  replay: <path d="M13 8A5 5 0 1 1 11 4M13 2v3h-3" />,
  check: <path d="M3 8.5 6.5 12 13 4.5" />,
  cross: <path d="M4 4 12 12M12 4 4 12" />,
  flag: <path d="M4 1v14M4 2h8l-2 3 2 3H4" />,
  range: <circle cx="8" cy="8" r="6" strokeDasharray="2 2" />,
};

/** One hand-cut glyph set; never Lucide/Phosphor/etc. (§0 non-negotiables). */
export function Glyph({ name, size = 16 }: GlyphProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
