import { useState, type JSX } from "react";
import type { ToPass } from "../ledger/types.ts";
import styles from "./ReasonCode.module.css";

type ReasonCodeProps = {
  code: string;
  humanSentence?: string;
  toPass?: ToPass;
};

/** §A.4/x402 — a rejection carries a self-correction object, not just a code. */
export function ReasonCode({
  code,
  humanSentence,
  toPass,
}: ReasonCodeProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const hasDetail = humanSentence !== undefined || toPass !== undefined;

  return (
    <span>
      <button
        type="button"
        className={styles.code}
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={hasDetail ? open : undefined}
      >
        {code}
      </button>
      {open && hasDetail && (
        <div className={styles.detail}>
          {humanSentence !== undefined && <p>{humanSentence}</p>}
          {toPass !== undefined &&
            Object.entries(toPass).map(([field, value]) => (
              <div className={styles.toPassRow} key={field}>
                <span>{field}</span>
                <span>{String(value)}</span>
              </div>
            ))}
        </div>
      )}
    </span>
  );
}
