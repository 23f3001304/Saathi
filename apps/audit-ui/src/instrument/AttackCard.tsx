import type { JSX } from "react";
import type { AttackLaneEntry } from "../ledger/attackLane.ts";
import { QuarantinedText } from "./QuarantinedText.tsx";
import { Timestamp } from "../primitives/Timestamp.tsx";
import styles from "./AttackCard.module.css";

type AttackCardProps = {
  entry: AttackLaneEntry;
  quarantinedContent?: string;
  onPin?: () => void;
};

/**
 * §2.1/§3.2 frame 4 — one blocked attempt, newest on top. The evidence card
 * for a quarantined write gets the barb: a hairline toward the thread that
 * stops 6px short — "the whole image," per §3.2. Width is the SVG's own
 * (`calc(100% - 6px)`), so the gap is real CSS pixels regardless of the
 * card's own width, not a fraction of a fixed viewBox.
 */
export function AttackCard({
  entry,
  quarantinedContent,
  onPin,
}: AttackCardProps): JSX.Element {
  return (
    <button type="button" className={styles.card} onClick={onPin}>
      <Timestamp iso={entry.ts} />
      <span className={styles.reason}>{entry.reasonCode}</span>
      <span className={styles.human}>{entry.human}</span>
      {quarantinedContent !== undefined && (
        <>
          <QuarantinedText content={quarantinedContent} clamp />
          <svg
            className={`${styles.barbLine} ${styles.barbDraw}`}
            style={{ width: "calc(100% - 6px)", height: 4 }}
            viewBox="0 0 100 4"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line
              x1={0}
              y1={2}
              x2={100}
              y2={2}
              pathLength={1}
              strokeDasharray={1}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </>
      )}
    </button>
  );
}
