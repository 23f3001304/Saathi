import type { JSX } from "react";
import { paise } from "../primitives/formatMoney.ts";
import { Meter } from "../primitives/Meter.tsx";
import { committedPaise, cooloffOrders, minutesUntil } from "./orderState.ts";
import type { OrderView } from "../api/merchantTypes.ts";
import styles from "./CooloffBoard.module.css";

/** A hold is 30 minutes; the bar shows how much of it has run. */
const WINDOW_MINUTES = 30;

type CooloffBoardProps = {
  orders: readonly OrderView[];
  now: Date;
};

/**
 * The column no other seller console has.
 *
 * Everywhere else a merchant sees an order or no order. Here they can see the
 * middle state the covenant invented: a purchase that is signed, committed and
 * deliberately not yet money, with the moment it releases. That is demand a
 * shop can plan against and revenue it must not count.
 *
 * What is not here, on purpose: any control. A cool-off exists so the person
 * who signed the cart can change their mind, and a seller who could cancel it
 * or release it early would be a seller holding the buyer's protection. The
 * merchant may look. Only the buyer may act.
 */
export function CooloffBoard({ orders, now }: CooloffBoardProps): JSX.Element {
  const holds = cooloffOrders(orders);
  if (holds.length === 0) {
    return (
      <p className={styles.empty}>
        Nothing on hold. This fills when someone buys and their cool-off is
        still running.
      </p>
    );
  }
  return (
    <div className={styles.board}>
      <div className={styles.total}>
        <span className={styles.totalValue}>
          {paise(committedPaise(orders))}
        </span>
        <span className={styles.totalLabel}>
          committed and not yet money, across {holds.length.toString()}{" "}
          {holds.length === 1 ? "purchase" : "purchases"}
        </span>
      </div>
      <ul className={styles.list}>
        {holds.map((order) => {
          const left = minutesUntil(order.cooloffUntil, now);
          const elapsed =
            left === null
              ? 0
              : Math.min(1, (WINDOW_MINUTES - left) / WINDOW_MINUTES);
          return (
            <li className={styles.hold} key={order.txnId}>
              <div className={styles.headRow}>
                <span className={`${styles.amount} tabular-nums`}>
                  {paise(order.amountPaise)}
                </span>
                <span className={styles.left}>
                  {left === null
                    ? "no release time recorded"
                    : left === 0
                      ? "releasing now"
                      : `${left.toString()} min left`}
                </span>
              </div>
              <Meter
                segments={[
                  {
                    fraction: elapsed,
                    style: "solid-indigo",
                    label: "elapsed",
                  },
                ]}
              />
              <span className={styles.txn}>{order.txnId}</span>
            </li>
          );
        })}
      </ul>
      <p className={styles.rule}>
        Only the buyer can cancel or release a cool-off.
      </p>
    </div>
  );
}
