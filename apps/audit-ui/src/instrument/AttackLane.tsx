import type { JSX } from "react";
import type { AttackLaneEntry } from "../ledger/attackLane.ts";
import type { TxnView } from "../ledger/reducer.ts";
import { AttackCard } from "./AttackCard.tsx";
import styles from "./AttackLane.module.css";

type AttackLaneProps = {
  attacks: AttackLaneEntry[];
  txns: Record<string, TxnView>;
  onPin?: (eventId: number) => void;
};

function quarantinedContentFor(
  entry: AttackLaneEntry,
  txns: Record<string, TxnView>,
): string | undefined {
  if (entry.txnId === null) return undefined;
  const rejected = txns[entry.txnId]?.memories.filter(
    (m) => m.outcome === "rejected",
  );
  return rejected?.[rejected.length - 1]?.content;
}

/**
 * §2.1/D14 — the attack gutter. Never a thread lane: nothing hostile is
 * ever part of the weave, and an empty lane stays silent rather than
 * reassuring — "0 attacks" copy would itself be a kind of noise.
 */
export function AttackLane({
  attacks,
  txns,
  onPin,
}: AttackLaneProps): JSX.Element | null {
  // The gutter is for what was aimed at a bound. Routine tier refusals are
  // counted and listed in the chip's sheet, but they are not hostile and do
  // not belong in a crimson lane.
  const hostile = attacks.filter((entry) => entry.kind !== "tier");
  // Silence renders as nothing at all: a lone hairline in the drawer read
  // as misalignment, and the chrome's chip already says the count.
  if (hostile.length === 0) {
    return null;
  }

  return (
    <div className={styles.lane} aria-live="assertive">
      <div className={styles.stack}>
        {hostile.map((entry) => (
          <AttackCard
            key={entry.id}
            entry={entry}
            quarantinedContent={quarantinedContentFor(entry, txns)}
            onPin={() => onPin?.(entry.id)}
          />
        ))}
      </div>
    </div>
  );
}
