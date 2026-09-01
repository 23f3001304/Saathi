// The chip counted thirty-eight refusals and had nowhere to send you: it was
// wired to an attack gutter that only ever listed `attack.detected`, and the
// quiet write-gate refusals bumped the number without recording a row. This
// is the list behind the number.
import type { JSX } from "react";
import { useLedgerSelector } from "../ledger/useLedger.ts";
import type { AttackLaneEntry } from "../ledger/attackLane.ts";
import styles from "./RefusalsSheet.module.css";

const HEADING: Record<string, string> = {
  attack: "Aimed at your rules",
  relaxation: "Tried to loosen a rule you signed",
  tier: "Not trusted enough to remember",
};

const LEDE: Record<string, string> = {
  attack: "Detected and recorded before it reached a decision.",
  relaxation:
    "Something tried to widen a rule you signed. Only your signature can do that.",
  tier: "Routine. Something read off a merchant's page tried to become a remembered fact — text on a web page is untrusted, so it was not kept.",
};

function Row({ entry }: { entry: AttackLaneEntry }): JSX.Element {
  return (
    <li className={styles.row}>
      <p className={styles.human}>{entry.human}</p>
      <p className={styles.meta}>
        {entry.rule !== null && (
          <span className={styles.rule}>{entry.rule}</span>
        )}
        <span className={styles.code}>{entry.reasonCode}</span>
        <span className={styles.when}>{entry.ts.slice(11, 19)}</span>
      </p>
      {entry.excerpt !== null && entry.excerpt !== "" && (
        <p className={styles.excerpt}>{entry.excerpt}</p>
      )}
    </li>
  );
}

function Group({
  kind,
  entries,
}: {
  kind: string;
  entries: readonly AttackLaneEntry[];
}): JSX.Element | null {
  if (entries.length === 0) return null;
  return (
    <section className={styles.group}>
      <h3 className={styles.heading}>
        {HEADING[kind]} <span className={styles.count}>{entries.length}</span>
      </h3>
      <p className={styles.lede}>{LEDE[kind]}</p>
      <ul className={styles.rows}>
        {entries.map((entry) => (
          <Row key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

export function RefusalsSheet({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element {
  const entries = useLedgerSelector((s) => s.attackEvents);
  const of = (kind: string): AttackLaneEntry[] =>
    entries.filter((entry) => entry.kind === kind);

  return (
    <div className={styles.layer}>
      <button
        type="button"
        className={styles.scrim}
        aria-label="Close"
        onClick={onClose}
      />
      <section
        className={styles.sheet}
        role="dialog"
        aria-label="What was refused"
      >
        <header className={styles.head}>
          <h2 className={styles.title}>What was refused</h2>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </header>
        {entries.length === 0 ? (
          <p className={styles.lede}>
            Nothing has been refused. Everything remembered so far was allowed
            to be.
          </p>
        ) : (
          <>
            <Group kind="attack" entries={of("attack")} />
            <Group kind="relaxation" entries={of("relaxation")} />
            <Group kind="tier" entries={of("tier")} />
          </>
        )}
      </section>
    </div>
  );
}
