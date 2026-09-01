import type { JSX } from "react";
import { Chip } from "../primitives/Chip.tsx";
import type { CueView } from "../api/merchantTypes.ts";
import { CUE_LABELS } from "../api/merchantTypes.ts";
import styles from "./CueList.module.css";

type CueListProps = {
  cues: readonly CueView[];
  /** Whether the detector has actually run over this copy yet. */
  checked: boolean;
  compact?: boolean;
};

/**
 * A cue is not an accusation. "Last few left" may be perfectly true. It is
 * shown with the bias it works on and the answer an agent already has, so the
 * merchant can decide whether the sentence is worth what it costs them — none
 * of this blocks a sale, and saying so is part of the panel.
 */
export function CueList({
  cues,
  checked,
  compact = false,
}: CueListProps): JSX.Element {
  if (!checked) {
    return <p className={styles.pending}>Reading what you wrote…</p>;
  }
  if (cues.length === 0) {
    return (
      <p className={styles.clean}>
        Nothing here reads as a trick. A buyer&rsquo;s agent takes this as a
        plain description.
      </p>
    );
  }
  return (
    <ul className={compact ? `${styles.list} ${styles.compact}` : styles.list}>
      {cues.map((cue) => (
        <li className={styles.cue} key={`${cue.kind}-${cue.phrase}`}>
          <div className={styles.head}>
            <Chip variant="crimson">{CUE_LABELS[cue.kind] ?? cue.kind}</Chip>
            <span className={styles.phrase}>&ldquo;{cue.phrase}&rdquo;</span>
          </div>
          {!compact && (
            <>
              <p className={styles.bias}>{cue.bias}</p>
              <p className={styles.counter}>{cue.counter}</p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
