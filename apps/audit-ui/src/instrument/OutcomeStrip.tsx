import type { JSX } from "react";
import type { OutcomePayload } from "../ledger/types.ts";
import { Money } from "../primitives/Money.tsx";
import styles from "./OutcomeStrip.module.css";

type OutcomeStripProps = {
  outcome: OutcomePayload | undefined;
};

const BORDER_CLASS: Record<OutcomePayload["status"], string> = {
  pending: styles.pending,
  captured: styles.captured,
  failed: styles.failed,
  parked: styles.parked,
};

/** §2.1 §6 / Moment (i) t=1.00 — reveals once, never re-animates on re-render. */
export function OutcomeStrip({
  outcome,
}: OutcomeStripProps): JSX.Element | null {
  if (outcome === undefined) return null;

  return (
    <div className={`${styles.strip} ${BORDER_CLASS[outcome.status]}`}>
      <span className={styles.status}>{outcome.status}</span>
      {outcome.status === "captured" && (
        <Money paise={outcome.amount_paise} className={styles.amount} />
      )}
      {outcome.status === "pending" && outcome.poll_attempt !== undefined && (
        <span className={styles.poll}>
          poll {outcome.poll_attempt} of {outcome.poll_of}
        </span>
      )}
    </div>
  );
}
