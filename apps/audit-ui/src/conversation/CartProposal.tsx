// §2.1 CartProposal — proposed → signing → verifying → held/rejected.
import type { JSX } from "react";
import type { ToPass } from "../ledger/types.ts";
import { Money } from "../primitives/Money.tsx";
import { Hash } from "../primitives/Hash.tsx";
import { Glyph } from "../primitives/Glyph.tsx";
import { ReasonCode } from "../primitives/ReasonCode.tsx";
import styles from "./CartProposal.module.css";

export type CartProposalState =
  "proposed" | "signing" | "verifying" | "held" | "rejected";

type CartProposalProps = {
  state: CartProposalState;
  itemCount: number;
  totalPaise: number;
  justifiedByCount: number;
  quoteSigOk: boolean;
  digest: string;
  rejection?: { code: string; humanSentence?: string; toPass?: ToPass };
  onInspectDigest: () => void;
};

export function CartProposal({
  state,
  itemCount,
  totalPaise,
  justifiedByCount,
  quoteSigOk,
  digest,
  rejection,
  onInspectDigest,
}: CartProposalProps): JSX.Element {
  const classes = [
    styles.card,
    state === "rejected" ? styles.rejected : "",
    state === "held" ? styles.held : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className={styles.summary}>
        <span>{itemCount === 1 ? "1 item" : `${itemCount} items`}</span>
        <Money paise={totalPaise} />
      </div>
      <p className={styles.meta}>
        justified by {justifiedByCount} memories · quote sig{" "}
        {quoteSigOk ? "✓" : "✗"} · digest <Hash value={digest} />
        <button
          type="button"
          className={styles.inspect}
          onClick={onInspectDigest}
          aria-label="Inspect memory digest"
        >
          <Glyph name="inspect" size={13} />
        </button>
      </p>
      {rejection !== undefined && (
        <ReasonCode
          code={rejection.code}
          humanSentence={rejection.humanSentence}
          toPass={rejection.toPass}
        />
      )}
    </div>
  );
}
