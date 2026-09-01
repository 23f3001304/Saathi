import type { JSX } from "react";
import type { DemandView } from "../api/merchantTypes.ts";
import styles from "./Demand.module.css";

type DemandProps = { demand: DemandView };

/**
 * The sale that did not happen. A merchant can read their own orders; nobody
 * can read the searches that matched nothing — except the party that ran them,
 * which is the buyer agent, and it writes what it did to the ledger.
 */
export function Demand({ demand }: DemandProps): JSX.Element {
  if (demand.unmet.length === 0) {
    return (
      <p className={styles.empty}>
        Nothing yet. This fills when a buyer searches your shop and finds
        nothing. Counted, never guessed at.
      </p>
    );
  }
  return (
    <div className={styles.demand}>
      <ul className={styles.list}>
        {demand.unmet.map((ask) => (
          <li className={styles.row} key={ask.query}>
            <span className={styles.query}>{ask.query}</span>
            <span className={styles.asks}>
              {ask.asks} {ask.asks === 1 ? "ask" : "asks"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
