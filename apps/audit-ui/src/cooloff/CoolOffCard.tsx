import type { JSX } from "react";
import type { CooloffPayload } from "../ledger/types.ts";
import { Money } from "../primitives/Money.tsx";
import { Countdown } from "../primitives/Countdown.tsx";
import { Glyph } from "../primitives/Glyph.tsx";
import styles from "./CoolOffCard.module.css";

type CoolOffCardProps = {
  item: CooloffPayload;
  cancelling: boolean;
  onCancel: () => void;
  onExpandCues?: () => void;
};

/** §2.4 — "verified, not executed." Cancel is one tap, no confirm (D11). */
export function CoolOffCard({
  item,
  cancelling,
  onCancel,
  onExpandCues,
}: CoolOffCardProps): JSX.Element {
  return (
    <div
      className={
        cancelling ? `${styles.card} ${styles.cancelling}` : styles.card
      }
    >
      <div className={styles.top}>
        <span>{item.merchant}</span>
        <Money paise={item.amount_paise} />
        <span>
          releases <Countdown releaseAt={item.release_at} />
        </span>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onCancel}
          disabled={cancelling}
        >
          Cancel
        </button>
      </div>
      <p className={styles.note}>
        Held by your cool-off rule. Nothing has been charged yet.
      </p>
      {item.cues.length > 0 && (
        <button type="button" className={styles.flag} onClick={onExpandCues}>
          <Glyph name="flag" size={12} /> {item.cues.length} pushy lines in this
          listing, ignored ›
        </button>
      )}
    </div>
  );
}
