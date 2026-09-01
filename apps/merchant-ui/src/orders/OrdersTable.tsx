import type { JSX } from "react";
import { Money } from "../primitives/Money.tsx";
import { Timestamp } from "../primitives/Timestamp.tsx";
import { STATE_NOTES, stateLabel } from "./orderState.ts";
import type { OrderView } from "../api/merchantTypes.ts";
import styles from "./OrdersTable.module.css";

type OrdersTableProps = { orders: readonly OrderView[] };

/**
 * Payment records, not shipments. Every column here is either money or a
 * covenant state; there is no dispatch, no courier and no address, because
 * Covenant settles against a signed cart and fulfils nothing.
 */
export function OrdersTable({ orders }: OrdersTableProps): JSX.Element {
  if (orders.length === 0) {
    return (
      <p className={styles.empty}>
        No orders yet. A row appears the moment someone buys.
      </p>
    );
  }
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Signed</th>
          <th scope="col">State</th>
          <th scope="col" className={styles.right}>
            Amount
          </th>
          <th scope="col">Transaction</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.txnId}>
            <td className={styles.when}>
              {order.createdAt === null ? (
                "—"
              ) : (
                <Timestamp iso={order.createdAt} variant="relative" />
              )}
            </td>
            <td>
              <span className={styles.state} title={STATE_NOTES[order.state]}>
                {stateLabel(order.state)}
              </span>
            </td>
            <td className={styles.right}>
              <Money paise={order.amountPaise} />
            </td>
            <td className={styles.ids}>
              <span>{order.txnId}</span>
              <span className={styles.cart}>{order.cartMandateId}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
