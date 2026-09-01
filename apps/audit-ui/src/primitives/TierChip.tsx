import type { JSX } from "react";
import type { MemoryTier } from "../ledger/types.ts";
import styles from "./TierChip.module.css";

type TierChipProps = {
  tier: MemoryTier;
  rejected?: boolean;
};

const TIER_CLASS: Record<MemoryTier, string> = {
  P3: styles.p3,
  P2: styles.p2,
  P1: styles.p1,
  P0: styles.p0,
};

const TIER_MEANING: Record<MemoryTier, string> = {
  P3: "user-signed, permanent",
  P2: "trusted second-party quote",
  P1: "unverified first-party claim",
  P0: "untrusted external content — untrusted is not hostile",
};

/** §2.1 — P0 is only ever crimson when a write is actually rejected. */
export function TierChip({
  tier,
  rejected = false,
}: TierChipProps): JSX.Element {
  const classes = rejected
    ? `${styles.tier} ${TIER_CLASS[tier]} ${styles.rejected}`
    : `${styles.tier} ${TIER_CLASS[tier]}`;
  return (
    <span className={styles.cell}>
      <span className={classes} title={TIER_MEANING[tier]}>
        {tier}
      </span>
    </span>
  );
}
