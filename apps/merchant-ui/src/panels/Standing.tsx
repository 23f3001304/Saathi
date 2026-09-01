import type { JSX } from "react";
import { Meter } from "../primitives/Meter.tsx";
import { percent } from "../primitives/formatMoney.ts";
import type { StandingView } from "../api/merchantTypes.ts";
import { reasonsFor } from "../advisor/standingReasons.ts";
import styles from "./Standing.module.css";

type StandingProps = { standing: StandingView };

/**
 * The fold that decides whether a buyer agent offers this merchant first —
 * and, under it, why. The score is a number; the sentences are the product.
 */
export function Standing({ standing }: StandingProps): JSX.Element {
  const kept =
    standing.counters.quotesTotal - standing.counters.quoteMismatches;
  return (
    <div className={styles.standing}>
      <div className={styles.headline}>
        <span className={styles.score}>{standing.score.toFixed(2)}</span>
        <span className={styles.caption}>
          from {standing.observations} things buyers did
        </span>
      </div>
      <Meter
        segments={[
          {
            fraction: fractionOf(kept, standing),
            style: "solid-ink",
            label: "matched",
          },
          {
            fraction: fractionOf(standing.counters.quoteMismatches, standing),
            style: "solid-crimson",
            label: "did not match",
          },
        ]}
      />
      <dl className={styles.terms}>
        {standing.contributions.map((term) => (
          <div className={styles.term} key={term.term}>
            <dt className={styles.termLabel}>{term.label}</dt>
            <dd className={styles.termValue}>
              {percent(term.rate, 0)}{" "}
              <span className={styles.termOf}>
                ({term.kept} of {term.of}) · weight {percent(term.weight, 0)}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <ul className={styles.reasons}>
        {reasonsFor(standing).map((reason) => (
          <li className={styles[reason.tone]} key={reason.text}>
            {reason.text}
          </li>
        ))}
      </ul>
      <p className={styles.rule}>
        This decides who gets offered first. It never decides what anyone is
        allowed to do.
      </p>
    </div>
  );
}

function fractionOf(part: number, standing: StandingView): number {
  const total = standing.counters.quotesTotal;
  return total === 0 ? 0 : part / total;
}
