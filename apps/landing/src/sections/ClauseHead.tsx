import type { JSX } from "react";
import styles from "./ClauseHead.module.css";

/**
 * Deed furniture shared by every clause: a full-width rule, the clause name
 * and folio mark in the audit hand, and the numeral as a watermark behind
 * the prose. The numeral is the section's largest element and its quietest:
 * hierarchy by scale, not by shouting.
 */
export function ClauseHead({
  kicker,
  leaf,
  numeral,
}: {
  kicker: string;
  leaf: string;
  numeral?: string;
}): JSX.Element {
  return (
    <header className={styles.head}>
      <p className={styles.row}>
        <span>{kicker}</span>
        <span>{leaf}</span>
      </p>
      {numeral !== undefined ? (
        <span className={styles.numeral} aria-hidden="true" data-parallax="0.1">
          {numeral}
        </span>
      ) : null}
    </header>
  );
}
