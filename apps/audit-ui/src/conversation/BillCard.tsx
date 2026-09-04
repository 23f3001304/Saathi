import { useState, type JSX } from "react";
import type { OptionRowData } from "./chatScript.ts";
import type { CovenantView } from "./assistantState.ts";
import { SaathiMark } from "../chrome/SaathiMark.tsx";
import { HoldToBuy } from "./HoldToBuy.tsx";
import { PayPanel } from "./PayPanel.tsx";
import { usePaymentState } from "./usePaymentState.ts";
import { paise } from "../primitives/formatMoney.ts";
import styles from "./BillCard.module.css";

/** The reel's covenant, used only when no run has stated a real one. */
const FIXTURE_COVENANT: CovenantView = {
  capPaise: 200_000,
  thumbprint: "did:key:z6Mk8Qr2f",
};

type BillCardProps = {
  picked: OptionRowData;
  onSigned: () => void;
  /**
   * What the intent signature actually committed to. `null` in fixture mode,
   * where the reel's own numbers stand in — never a live cap invented here.
   */
  covenant?: CovenantView | null;
  /**
   * Live signing: releases agent-host's cart gate. Resolving `false` leaves
   * the bill unsigned and says so, rather than flipping a local boolean over
   * a request the host never took.
   */
  onSign?: () => Promise<boolean>;
  /** The thread's copy of an already-signed bill: the record, no pen. */
  signedView?: boolean;
  /** The signed cart's own total, off the cart beat. When present it is the
   *  bill's Total: what you see must be what you sign, and a tapped card's
   *  client-side price is not the thing the signature releases. */
  cartTotalPaise?: number | null;
  /** Rising from the dock: full width, sunrise edge, the hero entrance. */
  dock?: boolean;
  /**
   * The transaction this bill became once the gateway issued it. Present only
   * after a run reached an outcome, and the only thing the card needs in order
   * to ask the gateway how the money actually went — everything else on the
   * pay panel comes back from that answer.
   */
  txnId?: string | null;
};

function SignedRow({
  thumbprint,
  onCollapse,
}: {
  thumbprint: string;
  onCollapse?: () => void;
}): JSX.Element {
  return (
    <p className={styles.signedRow}>
      <svg viewBox="0 0 12 12" className={styles.tick} aria-hidden="true">
        <path d="M2.5 6.2 4.8 8.6 9.5 3.4" />
      </svg>
      Signed · <span className={styles.key}>{thumbprint}</span>
      {onCollapse !== undefined && (
        <button type="button" className={styles.fold} onClick={onCollapse}>
          Collapse
        </button>
      )}
    </p>
  );
}

/**
 * The bill, in the conversation. It arrives as a message, is signed where it
 * stands, and then stays in the thread as the record. No overlay: a bill you
 * sign should live where the promise was made, not float above it.
 */
export function BillCard({
  picked,
  onSigned,
  covenant = null,
  onSign,
  signedView = false,
  dock = false,
  txnId = null,
  cartTotalPaise = null,
}: BillCardProps): JSX.Element {
  const [signed, setSigned] = useState(signedView);
  const [open, setOpen] = useState(!signedView);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const [nudge, setNudge] = useState(0);
  const price = paise(picked.pricePaise);
  const total = paise(cartTotalPaise ?? picked.pricePaise);
  const differs =
    cartTotalPaise !== null && cartTotalPaise !== picked.pricePaise;
  const terms = covenant ?? FIXTURE_COVENANT;
  const payment = usePaymentState(txnId, nudge);

  async function handleSigned(): Promise<void> {
    if (onSign === undefined) {
      setSigned(true);
      onSigned();
      return;
    }
    setBusy(true);
    const released = await onSign();
    setBusy(false);
    setRefused(!released);
    if (!released) return;
    setSigned(true);
    onSigned();
  }

  if (signedView && !open) {
    return (
      <button
        type="button"
        className={styles.record}
        onClick={() => setOpen(true)}
        aria-expanded={false}
      >
        <SaathiMark size={13} />
        <span className={styles.recordTitle}>Your bill</span>
        <span className={styles.recordAmount}>{price}</span>
        <svg viewBox="0 0 12 12" className={styles.tick} aria-hidden="true">
          <path d="M2.5 6.2 4.8 8.6 9.5 3.4" />
        </svg>
        <span className={styles.recordMeta}>
          {payment?.settled === "paid" ? "Paid" : "Signed"}
        </span>
      </button>
    );
  }

  return (
    <section
      className={dock ? `${styles.bill} ${styles.dock}` : styles.bill}
      aria-label="Your bill"
    >
      <header className={styles.brand}>
        <SaathiMark size={16} />
        <span>Saathi</span>
      </header>
      <h3 className={styles.title}>Your bill</h3>
      <dl className={styles.lines}>
        <div className={styles.line}>
          <dt>{picked.title}</dt>
          <dd>{price}</dd>
        </div>
        <div className={styles.line}>
          <dt>Your ceiling</dt>
          <dd>{paise(terms.capPaise)}</dd>
          <dt className={styles.limitNote}>Signed limits</dt>
          <dd className={styles.limitNote}>
            nothing above {paise(terms.capPaise)} · {terms.thumbprint}
          </dd>
        </div>
        <div className={`${styles.line} ${styles.total}`}>
          <dt>Total</dt>
          <dd>{total}</dd>
        </div>
      </dl>
      <p className={styles.memo}>Quote signed by {picked.merchant}.</p>
      {differs && (
        <p className={styles.memo}>
          This total is the signed cart&rsquo;s own number; the card you
          tapped said {price}.
        </p>
      )}
      {signed && payment !== null && (
        <PayPanel
          payment={payment}
          onNudge={() => setNudge((count) => count + 1)}
        />
      )}
      {signed ? (
        <SignedRow
          thumbprint={terms.thumbprint}
          onCollapse={signedView ? () => setOpen(false) : undefined}
        />
      ) : (
        <div className={styles.signRow}>
          <HoldToBuy
            label={busy ? "One moment…" : "Hold to buy"}
            busy={busy}
            onComplete={() => void handleSigned()}
          />
          {refused && (
            <span className={styles.refused}>
              That signature was not accepted. Nothing was signed.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
