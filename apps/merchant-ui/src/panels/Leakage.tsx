import type { JSX } from "react";
import { percent } from "../primitives/formatMoney.ts";
import { plural } from "../primitives/plural.ts";
import {
  cooloffRate,
  leakageLines,
  refundHonourRate,
} from "../advisor/leakageReasons.ts";
import type { LeakageView } from "../api/merchantTypes.ts";
import styles from "./Leakage.module.css";

type LeakageProps = { leakage: LeakageView };

/**
 * Where sales bleed out after the buyer had already decided. Every row is a
 * reason code a verdict actually named, counted straight off the event log —
 * not a category invented for this page.
 */
export function Leakage({ leakage }: LeakageProps): JSX.Element {
  return (
    <div className={styles.leakage}>
      <dl className={styles.rates}>
        <Rate
          label="Changed their mind"
          value={percent(cooloffRate(leakage), 0)}
          detail={`${leakage.counters.cooloffCancellations} of ${plural(leakage.counters.cartsTotal, "basket")}`}
        />
        <Rate
          label="Refunds honoured"
          value={percent(refundHonourRate(leakage), 0)}
          detail={`${leakage.counters.refundsHonored} of ${leakage.counters.refundsRequested} asked`}
        />
        <Rate
          label="Races for the last one, lost"
          value={leakage.stockConflicts.toString()}
          detail="not counted against you"
        />
      </dl>
      <ul className={styles.list}>
        {leakageLines(leakage).map((line) => (
          <li className={styles.row} key={line.reasonCode}>
            <div className={styles.head}>
              <span className={styles.label}>{line.label}</span>
              <span className={styles.count}>&times;{line.count}</span>
              <code className={styles.code}>{line.reasonCode}</code>
            </div>
            <p className={styles.cost}>{line.cost}</p>
          </li>
        ))}
      </ul>
      {!leakage.live && (
        <p className={styles.fixture}>
          Made-up figures — no shop is connected.
        </p>
      )}
    </div>
  );
}

function Rate({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}): JSX.Element {
  return (
    <div className={styles.rate}>
      <dt className={styles.rateLabel}>{label}</dt>
      <dd className={styles.rateValue}>{value}</dd>
      <dd className={styles.rateDetail}>{detail}</dd>
    </div>
  );
}
