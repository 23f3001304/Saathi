import type { JSX } from "react";
import type { Constraint } from "../api/types.ts";
import { Field } from "../primitives/Field.tsx";
import { formatConstraintValue } from "./formatConstraintValue.ts";
import styles from "./ConstraintRow.module.css";

type ConstraintRowProps = {
  constraint: Constraint;
  onAmend: (key: string, nextValue: string) => void;
  onRevoke: (key: string) => void;
};

/** §2.2 — signed (⬡ + timestamp) vs amended-unsigned (indigo, hollow ⬡). D9. */
export function ConstraintRow({
  constraint,
  onAmend,
  onRevoke,
}: ConstraintRowProps): JSX.Element {
  const rowClass = constraint.amended
    ? `${styles.row} ${styles.amended}`
    : styles.row;

  return (
    <div className={rowClass}>
      <span>{constraint.label}</span>
      <span className={styles.value}>
        <Field
          value={String(constraint.value)}
          display={formatConstraintValue(constraint)}
          amended={constraint.amended}
          onCommit={(next) => onAmend(constraint.key, next)}
        />
      </span>
      <span className={styles.signedAt}>
        {constraint.amended ? "unsigned" : (constraint.signedAt ?? "·")}
      </span>
      <span
        className={
          constraint.amended
            ? `${styles.seal} ${styles.sealHollow}`
            : styles.seal
        }
      >
        ⬡
      </span>
      <button
        type="button"
        className={styles.revoke}
        onClick={() => onRevoke(constraint.key)}
        aria-label={`Revoke ${constraint.label}`}
      >
        ·
      </button>
    </div>
  );
}
