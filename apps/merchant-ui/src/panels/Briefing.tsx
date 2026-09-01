import type { JSX } from "react";
import type { BriefingInput } from "../advisor/briefing.ts";
import { briefingFor } from "../advisor/briefing.ts";
import styles from "./Briefing.module.css";

/**
 * The one thing a shopkeeper wants: their problems, in the order they cost.
 *
 * Every figure in every sentence is read from a fold or from Razorpay. The
 * advisor decides the *order* and says what each costs; it is not the source
 * of a single number here, and it deliberately does not summarise — a
 * paragraph generated over the folds would be a fifth source nobody can check.
 */
export function Briefing(input: BriefingInput): JSX.Element {
  const items = briefingFor(input);
  if (items.length === 0) {
    return (
      <p className={styles.clean}>
        Nothing is costing you a sale right now. Every price you signed matched
        what the buyer was charged, no listing carries a line an agent flags,
        and every refund asked for was given.
      </p>
    );
  }
  return (
    <ol className={styles.list}>
      {items.map((item, index) => (
        <li className={styles.item} key={item.key}>
          <span className={styles.rank}>{index + 1}</span>
          <div className={styles.body}>
            <h3 className={styles.headline}>{item.headline}</h3>
            <p className={styles.detail}>{item.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
