import type { JSX } from "react";
import type { Constraint } from "../api/types.ts";
import { ConstraintRow } from "./ConstraintRow.tsx";
import styles from "./ConstraintList.module.css";

type ConstraintListProps = {
  constraints: Constraint[];
  onAmend: (key: string, nextValue: string) => void;
  onRevoke: (key: string) => void;
  onAdd: () => void;
};

/** §2.2 I — "the agent cannot be talked out of them — including by you." */
export function ConstraintList({
  constraints,
  onAmend,
  onRevoke,
  onAdd,
}: ConstraintListProps): JSX.Element {
  return (
    <section className={styles.list}>
      <div className={styles.header}>
        <span className={styles.title}>Hard limits</span>
        <span className={styles.badge}>only you can change these</span>
      </div>
      {constraints.map((constraint) => (
        <ConstraintRow
          key={constraint.key}
          constraint={constraint}
          onAmend={onAmend}
          onRevoke={onRevoke}
        />
      ))}
      <button type="button" className={styles.add} onClick={onAdd}>
        + add a bound
      </button>
    </section>
  );
}
