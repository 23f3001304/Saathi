import type { JSX } from "react";
import type { MerchantTrustEntry } from "../api/types.ts";
import { Meter } from "../primitives/Meter.tsx";
import styles from "./MerchantTrust.module.css";

type MerchantTrustProps = {
  merchants: MerchantTrustEntry[];
  onSelect?: (merchant: string) => void;
};

/** §2.3 — a 3-segment meter, no red-amber-green colour ramp. */
export function MerchantTrust({
  merchants,
  onSelect,
}: MerchantTrustProps): JSX.Element {
  return (
    <div className={styles.list}>
      {merchants.map((m) => (
        <button
          type="button"
          key={m.merchant}
          className={styles.row}
          onClick={() => onSelect?.(m.merchant)}
        >
          <span>
            {m.merchant} {m.flagged && <span className={styles.flag}>⚑</span>}
          </span>
          <span className={styles.score}>{m.score}</span>
          <Meter
            segments={[
              {
                fraction: m.honouredFraction,
                style: "solid-ink",
                label: "honoured",
              },
              {
                fraction: m.unknownFraction,
                style: "faint-ink",
                label: "unknown",
              },
              {
                fraction: m.mismatchFraction,
                style: "solid-crimson",
                label: "mismatch",
              },
            ]}
          />
          <span className={styles.detail}>
            {m.quoteMismatch} quotes broken · {m.manipulation} manipulation
            attempts · {m.refunds} refunds honoured
          </span>
        </button>
      ))}
    </div>
  );
}
