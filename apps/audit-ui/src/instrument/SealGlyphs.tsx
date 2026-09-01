import type { JSX } from "react";
import type { SealCheck } from "../ledger/types.ts";

// Hand-cut glyphs for the §12 VerdictCheck set (D6: six core + two
// fiduciary) — never an icon package (§0). 24×24 canvas, stroke currentColor.
const PATHS: Record<SealCheck, JSX.Element> = {
  intent_bounds: (
    <>
      <path d="M5 8v8M19 8v8" />
      <path d="M5 12h14" />
    </>
  ),
  nonce: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1" />
      <path d="M9 12h6M12 9v6" />
    </>
  ),
  uri_pin: (
    <path d="M12 3c3.3 0 6 2.6 6 6 0 4.5-6 12-6 12S6 13.5 6 9c0-3.4 2.7-6 6-6ZM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
  ),
  risk_data: (
    <>
      <path d="M4 16a8 8 0 0 1 16 0" />
      <path d="M12 16 15 10" />
    </>
  ),
  memory_digest: (
    <>
      <rect x="5" y="5" width="6" height="6" />
      <rect x="13" y="5" width="6" height="6" />
      <rect x="5" y="13" width="6" height="6" />
      <rect x="13" y="13" width="6" height="6" />
    </>
  ),
  quote_match: <path d="M4 9 9 14 20 5M4 17h8" />,
  envelope: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="1" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  cooloff: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 9v4l3 2M9 2h6" />
    </>
  ),
};

type SealGlyphProps = { check: SealCheck; size?: number };

/** One glyph per check — the seal's identity, not its verdict (colour handles that). */
export function SealGlyph({ check, size = 22 }: SealGlyphProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[check]}
    </svg>
  );
}
