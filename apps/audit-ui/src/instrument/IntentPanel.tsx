import type { JSX } from "react";
import type { IntentPayload } from "../ledger/types.ts";
import { Money } from "../primitives/Money.tsx";
import { Hash } from "../primitives/Hash.tsx";
import { Skeleton } from "../primitives/Skeleton.tsx";
import styles from "./IntentPanel.module.css";

type IntentPanelProps = {
  intent: IntentPayload | undefined;
  loading: boolean;
};

/** §2.1 §1 — loading: hairline skeletons, no shimmer. */
export function IntentPanel({
  intent,
  loading,
}: IntentPanelProps): JSX.Element {
  if (loading) {
    return (
      <div className={styles.skeletons}>
        <Skeleton width="80%" />
        <Skeleton width="40%" />
      </div>
    );
  }

  if (intent === undefined) {
    return <p className={styles.description}>No signed intent yet.</p>;
  }

  return (
    <div className={styles.panel}>
      <p className={styles.description}>
        {intent.natural_language_description}
      </p>
      <div className={styles.bounds}>
        <span>
          cap <Money paise={intent.bounds.max_amount_paise} />
        </span>
        <span>{intent.bounds.merchants?.length ?? 0} merchants</span>
        <span>
          expires {new Date(intent.bounds.intent_expiry).toLocaleTimeString()}
        </span>
        {intent.thumbprint !== null && <Hash value={intent.thumbprint} />}
      </div>
    </div>
  );
}
