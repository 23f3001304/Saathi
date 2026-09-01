// §2.1/§3.1/§4.5 — one verdict check, from pre-verdict ring to settled stamp.
import { useEffect, useId, useRef, type JSX } from "react";
import type { SealCheck, ToPass } from "../ledger/types.ts";
import type { SealState } from "../ledger/selectors.ts";
import { SealGlyph } from "./SealGlyphs.tsx";
import { Countdown } from "../primitives/Countdown.tsx";
import { useStamp, type SealElements } from "../motion/useStamp.ts";
import styles from "./Seal.module.css";

export type SealProps = {
  check: SealCheck;
  state: SealState;
  reasonCode?: string;
  humanSentence?: string;
  toPass?: ToPass;
  heldUntil?: string;
  size?: 36 | 44 | 56;
  stampDelayMs?: number;
  onInspect?: () => void;
};

const LABELS: Record<SealCheck, string> = {
  intent_bounds: "Bounds",
  nonce: "Nonce",
  uri_pin: "URI Pin",
  risk_data: "Risk",
  memory_digest: "Digest",
  quote_match: "Quote",
  envelope: "Envelope",
  cooloff: "Cool-off",
};

const RING_CLASS: Record<SealState, string> = {
  pending: styles.ringPending,
  passed: styles.ringPassed,
  failed: styles.ringFailed,
  held: styles.ringHeld,
};
const GLYPH_CLASS: Record<SealState, string> = {
  pending: styles.glyphPending,
  passed: styles.glyphPassed,
  failed: styles.glyphFailed,
  held: styles.glyphHeld,
};

function useSealStamp(
  state: SealState,
  delayMs: number,
  elements: () => SealElements | null,
): void {
  const stamp = useStamp();
  const prevState = useRef<SealState>("pending");
  useEffect(() => {
    if (prevState.current === "pending" && state !== "pending") {
      const els = elements();
      if (els !== null) stamp(els, delayMs);
    }
    prevState.current = state;
  }, [state, delayMs, elements, stamp]);
}

/** §7.4 — `role="img"` with a verdict-bearing label; the label text stays ink. */
export function Seal({
  check,
  state,
  heldUntil,
  size = 36,
  stampDelayMs = 0,
  onInspect,
}: SealProps): JSX.Element {
  const hatchId = useId();
  const containerRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const fillRef = useRef<SVGCircleElement>(null);
  const glyphRef = useRef<SVGGElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useSealStamp(state, stampDelayMs, () =>
    containerRef.current &&
    ringRef.current &&
    fillRef.current &&
    glyphRef.current &&
    labelRef.current
      ? {
          container: containerRef.current,
          ring: ringRef.current,
          fill: fillRef.current,
          glyph: glyphRef.current,
          label: labelRef.current,
        }
      : null,
  );

  const r = size / 2 - 3;
  const fillClass =
    state === "failed"
      ? styles.fillFailed
      : state === "passed"
        ? styles.fillPassed
        : undefined;
  const ringStroke = state === "failed" ? `url(#${hatchId})` : undefined;

  return (
    <button
      type="button"
      className={styles.button}
      onClick={onInspect}
      aria-label={`${LABELS[check]} check: ${state}`}
    >
      <svg
        role="img"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <defs>
          <pattern
            id={hatchId}
            patternUnits="userSpaceOnUse"
            width={5}
            height={5}
            patternTransform="rotate(45)"
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={5}
              stroke="var(--crimson)"
              strokeWidth={1}
            />
          </pattern>
        </defs>
        <g ref={containerRef}>
          <circle
            ref={ringRef}
            cx={size / 2}
            cy={size / 2}
            r={r}
            pathLength={1}
            strokeDasharray={state === "pending" ? undefined : 1}
            strokeDashoffset={state === "pending" ? 0 : 1}
            stroke={ringStroke}
            className={`${styles.ring} ${RING_CLASS[state]}`}
          />
          {fillClass !== undefined && (
            <circle
              ref={fillRef}
              cx={size / 2}
              cy={size / 2}
              r={r - 4}
              opacity={0}
              className={fillClass}
            />
          )}
          <g
            ref={glyphRef}
            transform={`translate(${size / 2 - size / 4} ${size / 2 - size / 4})`}
            className={GLYPH_CLASS[state]}
          >
            <SealGlyph check={check} size={size / 2} />
          </g>
          {state === "held" && (
            <circle
              className={styles.countdownRing}
              cx={size / 2}
              cy={size / 2}
              r={r + 2}
            />
          )}
        </g>
      </svg>
      <span
        ref={labelRef}
        className={
          state === "pending"
            ? styles.label
            : `${styles.label} ${styles.labelActive}`
        }
      >
        {LABELS[check]}
      </span>
      {state === "held" && heldUntil !== undefined && (
        <Countdown releaseAt={heldUntil} />
      )}
    </button>
  );
}
