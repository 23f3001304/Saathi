import type { JSX } from "react";
import type { ProposedChange } from "./amendmentModel.ts";
import { directionOf, labelOf, valueText } from "./amendmentModel.ts";
import styles from "./AmendmentChanges.module.css";

type AmendmentChangesProps = { changes: ProposedChange[] };

const CAPTION: Record<string, string> = {
  narrows: "narrows what I may do",
  widens: "widens what I may do",
};

/**
 * Lowering a cap and raising one are not the same act, so they are not drawn
 * the same. A narrowing is quiet indigo line-work; a widening is hatched and
 * crimson and says out loud which way it points. The direction is recomputed
 * here from `from` and `to` on every render — nothing that arrived with the
 * proposal gets a say in how the proposal looks.
 */
export function AmendmentChanges({
  changes,
}: AmendmentChangesProps): JSX.Element {
  return (
    <ul className={styles.list}>
      {changes.map((change, i) => {
        const direction = directionOf(change);
        return (
          <li
            key={`${change.rule}-${change.scope ?? ""}-${i}`}
            className={
              direction === "widens"
                ? `${styles.change} ${styles.widens}`
                : styles.change
            }
          >
            <span className={styles.label}>{labelOf(change)}</span>
            <span className={styles.move}>
              <span className={styles.from}>
                {valueText(change, change.from)}
              </span>
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
              <span className={styles.to}>{valueText(change, change.to)}</span>
            </span>
            <span className={styles.direction}>
              <span className={styles.mark} aria-hidden="true">
                {direction === "widens" ? "◇" : "◆"}
              </span>
              {CAPTION[direction]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
