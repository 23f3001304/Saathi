import type { JSX } from "react";
import type { CartPayload } from "../ledger/types.ts";
import { Money } from "../primitives/Money.tsx";
import { Glyph } from "../primitives/Glyph.tsx";
import { Hash } from "../primitives/Hash.tsx";
import styles from "./CartPanel.module.css";

type CartPanelProps = {
  cart: CartPayload | undefined;
  onInspectDigest?: () => void;
};

/** §2.1 §3 — the digest opens O2; a quote signature is verified, not assumed. */
export function CartPanel({
  cart,
  onInspectDigest,
}: CartPanelProps): JSX.Element {
  if (cart === undefined)
    return <p className={styles.items}>No cart proposed yet.</p>;

  return (
    <div className={styles.panel}>
      <div className={styles.summary}>
        <span>{cart.items.length} items</span>
        <Money paise={cart.total_paise} />
      </div>
      <div className={styles.items}>
        {cart.items.map((item) => item.title).join(", ")}
      </div>
      <span
        className={
          cart.quote_signature_valid
            ? `${styles.signature} ${styles.signatureOk}`
            : `${styles.signature} ${styles.signatureBad}`
        }
      >
        quote sig {cart.quote_signature_valid ? "✓" : "✗"}
      </span>
      <span className={styles.digest}>
        digest <Hash value={cart.memory_digest} />
        <button
          type="button"
          onClick={onInspectDigest}
          aria-label="Inspect memory digest"
        >
          <Glyph name="inspect" size={14} />
        </button>
      </span>
    </div>
  );
}
