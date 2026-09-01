import { useState, type JSX } from "react";
import type { PendingAmendment } from "../covenant/amendmentModel.ts";
import { widens } from "../covenant/amendmentModel.ts";
import { AmendmentChanges } from "../covenant/AmendmentChanges.tsx";
import { HoldToSign } from "../covenant/HoldToSign.tsx";
import { SaathiMark } from "../chrome/SaathiMark.tsx";
import { useReducedMotion } from "../motion/useReducedMotion.ts";
import type { RosetteStage } from "../kolam/Rosette.tsx";
import styles from "./AmendmentProposal.module.css";

type AmendmentProposalProps = {
  amendment: PendingAmendment;
  /** Absent once the amendment has been sealed: the record keeps no pen. */
  onSeal?: () => void;
  onDiscard?: () => void;
  sealed?: boolean;
};

const THUMBPRINT = "did:key:z6Mk8Qr2f";

/**
 * A change to the covenant, in the conversation where it was asked for.
 *
 * The agent proposed this; it did not make it. Nothing on this card has taken
 * effect, and the only control that can make it take effect is the same 600 ms
 * hold the rest of the product signs with — which is the whole claim of the
 * product, and is why a widening proposal is drawn to be noticed rather than
 * to be dismissed.
 */
export function AmendmentProposal({
  amendment,
  onSeal,
  onDiscard,
  sealed = false,
}: AmendmentProposalProps): JSX.Element {
  const reducedMotion = useReducedMotion();
  const [stage, setStage] = useState<RosetteStage>("idle");
  const loosens = widens(amendment);

  function handleComplete(): void {
    setStage("drawing");
    onSeal?.();
  }

  return (
    <section
      className={loosens ? `${styles.card} ${styles.loosens}` : styles.card}
      aria-label="Proposed change to your rules"
    >
      <header className={styles.brand}>
        <SaathiMark size={16} />
        <span>Proposed change to your rules</span>
      </header>
      <h3 className={styles.summary}>{amendment.summary}</h3>
      <AmendmentChanges changes={amendment.changes} />
      {loosens && !sealed && (
        <p className={styles.warning}>
          This loosens a rule you signed. I cannot do that on my own, and I have
          not: it takes your signature.
        </p>
      )}
      {sealed ? (
        <p className={styles.signedRow}>
          <svg viewBox="0 0 12 12" className={styles.tick} aria-hidden="true">
            <path d="M2.5 6.2 4.8 8.6 9.5 3.4" />
          </svg>
          Signed · <span className={styles.key}>{THUMBPRINT}</span>
        </p>
      ) : (
        <div className={styles.signRow}>
          <HoldToSign
            stage={stage}
            reducedMotion={reducedMotion}
            label="hold to sign"
            onComplete={handleComplete}
          />
          <div className={styles.aside}>
            <p className={styles.note}>
              Unsigned. It is waiting on your Rules screen too.
            </p>
            {onDiscard !== undefined && (
              <button
                type="button"
                className={styles.discard}
                onClick={onDiscard}
              >
                Discard
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
