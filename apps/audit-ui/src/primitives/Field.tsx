import { useState, type JSX, type KeyboardEvent } from "react";
import styles from "./Field.module.css";

type FieldProps = {
  value: string;
  display: string;
  amended: boolean;
  onCommit: (next: string) => void;
};

/** §2.2 D9 — edits are inert amendments (client-side) until sealed by O1. */
export function Field({
  value,
  display,
  amended,
  onCommit,
}: FieldProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit(): void {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        className={styles.input}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <button
      type="button"
      className={
        amended ? `${styles.display} ${styles.amended}` : styles.display
      }
      onClick={() => setEditing(true)}
    >
      {display}
    </button>
  );
}
