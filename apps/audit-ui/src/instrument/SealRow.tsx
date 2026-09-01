// §2.1/§3.1 Moment (i) — six core checks, then the fiduciary pair (D6).
import { useEffect, useRef, type JSX } from "react";
import { animate } from "motion";
import { deriveSealStates, type SealView } from "../ledger/selectors.ts";
import type {
  CooloffPayload,
  Stage0Rejection,
  VerdictCheckResult,
} from "../ledger/types.ts";
import { Seal } from "./Seal.tsx";
import { ReasonCode } from "../primitives/ReasonCode.tsx";
import { EASE, SEAL_STAGGER_S } from "../motion/presets.ts";
import { useReducedMotion } from "../motion/useReducedMotion.ts";
import styles from "./SealRow.module.css";

const CORE_COUNT = 6;

type SealRowProps = {
  checks: VerdictCheckResult[];
  stage0Rejection?: Stage0Rejection;
  cooloff?: CooloffPayload;
  latencyMs?: number;
  onInspect?: (seal: SealView) => void;
};

/**
 * A stage-0 admission rejection never reaches the check pipeline — the row
 * stays in its pre-verdict dotted state (D7's logic, one level up: absence
 * of the whole row, not just one seal) with the reason surfaced above it.
 */
function Stage0Row({ rejection }: { rejection: Stage0Rejection }): JSX.Element {
  const pending = deriveSealStates([]);
  return (
    <div
      className={styles.row}
      role="list"
      aria-label="Gateway verdicts: rejected before the check pipeline ran"
    >
      <ReasonCode
        code={rejection.reason_code}
        humanSentence={rejection.human_sentence}
        toPass={rejection.to_pass}
      />
      <div className={styles.core}>
        {pending.slice(0, CORE_COUNT).map((seal) => (
          <Seal key={seal.check} check={seal.check} state="pending" />
        ))}
      </div>
      <hr className={styles.chainRule} />
      <div className={styles.fiduciaryRow}>
        {pending.slice(CORE_COUNT).map((seal) => (
          <Seal key={seal.check} check={seal.check} state="pending" />
        ))}
      </div>
    </div>
  );
}

function bounceRow(row: HTMLElement, reducedMotion: boolean): void {
  if (reducedMotion) return;
  for (let i = 0; i < CORE_COUNT; i++) {
    animate(
      row,
      { y: [0, 1, 0] },
      { duration: 0.09, ease: EASE.stamp, delay: i * SEAL_STAGGER_S },
    );
  }
}

export function SealRow({
  checks,
  stage0Rejection,
  cooloff,
  latencyMs,
  onInspect,
}: SealRowProps): JSX.Element {
  const reducedMotion = useReducedMotion();
  const rowRef = useRef<HTMLDivElement>(null);
  const wasPending = useRef(true);
  // Computed before the early return below so every hook this component
  // calls — including the effect right after — runs on every render
  // regardless of branch (a stage-0 rejection can arrive on an instance
  // that was already showing a settled row for a different txn).
  const settled = stage0Rejection === undefined && checks.length > 0;

  useEffect(() => {
    if (wasPending.current && settled && rowRef.current !== null) {
      bounceRow(rowRef.current, reducedMotion);
    }
    wasPending.current = !settled;
  }, [settled, reducedMotion]);

  if (stage0Rejection !== undefined)
    return <Stage0Row rejection={stage0Rejection} />;

  const seals = deriveSealStates(checks, cooloff);
  const core = seals.slice(0, CORE_COUNT);
  const fiduciary = seals.slice(CORE_COUNT);

  return (
    <div
      className={styles.row}
      role="list"
      aria-label="Gateway verdicts"
      ref={rowRef}
    >
      <div className={styles.core}>
        {core.map((seal, i) => (
          <Seal
            key={seal.check}
            check={seal.check}
            state={seal.state}
            reasonCode={seal.reasonCode}
            humanSentence={seal.humanSentence}
            toPass={seal.toPass}
            stampDelayMs={reducedMotion ? 0 : i * SEAL_STAGGER_S * 1000}
            onInspect={() => onInspect?.(seal)}
          />
        ))}
      </div>
      {latencyMs !== undefined && (
        <span
          className={`${styles.latency} ${settled ? styles.latencyShown : ""}`}
        >
          verified in {latencyMs} ms
        </span>
      )}
      <hr className={styles.chainRule} />
      <div className={styles.fiduciaryRow} aria-label="Fiduciary checks">
        {fiduciary.map((seal) => (
          <Seal
            key={seal.check}
            check={seal.check}
            state={seal.state}
            reasonCode={seal.reasonCode}
            humanSentence={seal.humanSentence}
            toPass={seal.toPass}
            heldUntil={seal.heldUntil}
            stampDelayMs={reducedMotion ? 0 : 790}
            onInspect={() => onInspect?.(seal)}
          />
        ))}
      </div>
    </div>
  );
}
