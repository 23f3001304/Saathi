import type { JSX } from "react";
import type { TransactionSummary } from "../api/types.ts";
import { Glyph } from "../primitives/Glyph.tsx";
import styles from "./TxnRail.module.css";

type TxnRailProps = {
  transactions: TransactionSummary[];
  activeTxnId: string | null;
  isLive: boolean;
  onSelect: (txnId: string) => void;
  onGoLive: () => void;
  onReplay: (speed: 1 | 4) => void;
};

const STATE_CLASS: Record<TransactionSummary["state"], string | undefined> = {
  captured: styles.pass,
  failed: styles.fail,
  parked: undefined,
  pending: undefined,
};

/** §2.1 — mode switch (live/rewind) plus D22's replay-insurance control. */
export function TxnRail({
  transactions,
  activeTxnId,
  isLive,
  onSelect,
  onGoLive,
  onReplay,
}: TxnRailProps): JSX.Element {
  return (
    <div className={styles.rail}>
      <button
        type="button"
        className={styles.live}
        onClick={onGoLive}
        aria-pressed={isLive}
      >
        {isLive ? "▸ live" : "◂ rewind"}
      </button>
      {transactions.map((txn) => (
        <button
          type="button"
          key={txn.txnId}
          className={
            txn.txnId === activeTxnId
              ? `${styles.txn} ${styles.txnActive}`
              : styles.txn
          }
          onClick={() => onSelect(txn.txnId)}
        >
          #{txn.shortId}{" "}
          <span className={STATE_CLASS[txn.state]}>
            {txn.state === "captured" ? "✓" : txn.state === "failed" ? "✗" : ""}
          </span>
        </button>
      ))}
      <button
        type="button"
        className={styles.replay}
        onClick={() => onReplay(1)}
        title="Replay from real ledger timestamps"
      >
        <Glyph name="replay" size={14} /> replay 1×
      </button>
      <button
        type="button"
        className={styles.replay}
        onClick={() => onReplay(4)}
      >
        4×
      </button>
    </div>
  );
}
