// Every purchase this covenant has run, as a shopper's order history — what
// was bought, for how much, where the money stands, and (opened) the payment
// trail behind it. The Ledger stays the instrument; this screen answers the
// ordinary question "what did I buy and did it go through".
import { useState, type JSX } from "react";
import { fetchOrders, stateWord, type OrderItem } from "../api/orders.ts";
import {
  fetchPaymentState,
  type PaymentState,
} from "../api/paymentState.ts";
import { useResource } from "../api/useResource.ts";
import { rupeesRounded } from "../primitives/formatMoney.ts";
import styles from "./Orders.module.css";

function whenOf(iso: string | null): string {
  if (iso === null) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Paid" is only ever the gateway's own word — same rule as the bill. */
function toneOf(state: string): string {
  const word = stateWord(state);
  if (word === "Paid") return styles.paid ?? "";
  if (word === "Failed" || word === "Refused") return styles.failed ?? "";
  return styles.waiting ?? "";
}

function Trail({ payment }: { payment: PaymentState | null }): JSX.Element {
  if (payment === null) {
    return <p className={styles.trailNote}>Reading the payment trail…</p>;
  }
  return (
    <dl className={styles.trail}>
      <dt>Settled</dt>
      <dd>{payment.settled}</dd>
      <dt>Order</dt>
      <dd>{payment.orderId ?? "no rail order"}</dd>
      <dt>Payment</dt>
      <dd>{payment.paymentId ?? "none yet"}</dd>
      <dt>Transaction</dt>
      <dd className={styles.mono}>{payment.txnId}</dd>
    </dl>
  );
}

function OrderRow({ order }: { order: OrderItem }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [payment, setPayment] = useState<PaymentState | null>(null);

  function toggle(): void {
    const next = !open;
    setOpen(next);
    if (next && payment === null) {
      void fetchPaymentState(order.txnId).then(setPayment);
    }
  }

  return (
    <li className={styles.row}>
      <button type="button" className={styles.head} onClick={toggle}>
        <span className={styles.merchant}>
          {order.merchant ?? "unknown merchant"}
        </span>
        <span className={styles.when}>{whenOf(order.createdAt)}</span>
        <span className={`${styles.state} ${toneOf(order.state)}`}>
          {stateWord(order.state)}
        </span>
        <span className={styles.amount}>{rupeesRounded(order.amountPaise)}</span>
      </button>
      {open && <Trail payment={payment} />}
    </li>
  );
}

export function Orders(): JSX.Element {
  const orders = useResource(fetchOrders);
  const items = orders.data ?? [];
  return (
    <div className={styles.screen}>
      <h2 className={styles.title}>Orders</h2>
      {orders.loading && <p className={styles.note}>Reading the record…</p>}
      {!orders.loading && items.length === 0 && (
        <p className={styles.note}>
          Nothing has been bought yet. Every purchase lands here, with its
          payment trail.
        </p>
      )}
      <ul className={styles.list}>
        {items.map((order) => (
          <OrderRow key={order.txnId} order={order} />
        ))}
      </ul>
    </div>
  );
}
