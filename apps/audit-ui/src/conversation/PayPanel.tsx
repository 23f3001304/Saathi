import { useState, type JSX } from "react";

import type { PaymentState } from "../api/paymentState.ts";
import { openCheckout } from "./razorpayCheckout.ts";
import { PaymentQr } from "./PaymentQr.tsx";
import styles from "./PayPanel.module.css";

type PayPanelProps = {
  payment: PaymentState;
  /** Ask the gateway again now, rather than at the next tick of the poll. */
  onNudge: () => void;
};

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function PaidRow({ paymentId }: { paymentId: string | null }): JSX.Element {
  return (
    <p className={styles.paid}>
      <svg viewBox="0 0 12 12" className={styles.tick} aria-hidden="true">
        <path d="M2.5 6.2 4.8 8.6 9.5 3.4" />
      </svg>
      <span>Paid</span>
      {paymentId !== null && <code className={styles.id}>{paymentId}</code>}
    </p>
  );
}

function FailedRow(): JSX.Element {
  return (
    <p className={styles.failed}>
      That payment did not go through. Nothing was charged.
    </p>
  );
}

/** The phone half: scan, or read the URL. Both, because a QR alone is opaque. */
function LinkHalf({ url }: { url: string }): JSX.Element {
  return (
    <div className={styles.phone}>
      <PaymentQr url={url} />
      <div className={styles.phoneText}>
        <span className={styles.phoneTitle}>Or pay from your phone</span>
        <a
          className={styles.link}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
        >
          {shortUrl(url)}
        </a>
      </div>
    </div>
  );
}

function useCheckout(
  payment: PaymentState,
  onNudge: () => void,
): { busy: boolean; failure: string | null; start: () => void } {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function start(): void {
    const { orderId, keyId } = payment;
    if (orderId === null || keyId === null) return;
    setBusy(true);
    setFailure(null);
    void openCheckout({
      keyId,
      orderId,
      amountPaise: payment.amountPaise,
      currency: payment.currency,
      description: `Covenant ${payment.txnId}`,
      onSettled: () => {
        setBusy(false);
        onNudge();
      },
      onDismissed: () => {
        setBusy(false);
      },
    }).catch((error: unknown) => {
      setBusy(false);
      setFailure(
        error instanceof Error ? error.message : "checkout could not open",
      );
    });
  }

  return { busy, failure, start };
}

/**
 * How this bill gets paid, and whether it has been.
 *
 * Two routes, one order. "Pay now" opens Razorpay's own checkout on the order
 * the gateway created, so the shopper chooses UPI or a card inside Razorpay's
 * frame; the QR opens the hosted payment link on a phone. Neither is the
 * source of the paid state — that comes from the ledger, on a poll, and the
 * success callback only makes this panel ask sooner.
 */
export function PayPanel({ payment, onNudge }: PayPanelProps): JSX.Element {
  const { busy, failure, start } = useCheckout(payment, onNudge);

  if (payment.settled === "paid") {
    return (
      <section className={styles.panel} aria-label="Payment">
        <PaidRow paymentId={payment.paymentId} />
      </section>
    );
  }

  const canCheckout = payment.orderId !== null && payment.keyId !== null;
  return (
    <section className={styles.panel} aria-label="Payment">
      {payment.settled === "failed" && <FailedRow />}
      {canCheckout && (
        <button
          type="button"
          className={styles.pay}
          onClick={start}
          disabled={busy}
        >
          {busy ? "Opening…" : "Pay now"}
        </button>
      )}
      {payment.linkUrl !== null && <LinkHalf url={payment.linkUrl} />}
      {payment.linkUrl === null && canCheckout && (
        // The quota-exhausted path, said plainly rather than hidden: no link
        // was minted, and the order still has a working checkout.
        <p className={styles.note}>
          No payment link was issued for this bill, so there is nothing to scan.
          Pay now still works — it opens the same checkout on this order.
        </p>
      )}
      {!canCheckout && payment.linkUrl === null && (
        <p className={styles.note}>
          This bill has no payment route yet. Nothing has been charged.
        </p>
      )}
      {failure !== null && <p className={styles.note}>{failure}</p>}
      {payment.settled === "waiting" && (
        <p className={styles.waiting}>
          <span className={styles.pulse} aria-hidden="true" />
          Waiting for payment. This bill updates itself.
        </p>
      )}
    </section>
  );
}
