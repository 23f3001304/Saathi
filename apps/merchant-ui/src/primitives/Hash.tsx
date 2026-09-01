import { useState, type JSX } from "react";
import styles from "./Hash.module.css";

type HashProps = {
  value: string;
  full?: boolean;
  /** Names the value in the copy confirmation: "Memory digest copied". */
  label?: string;
};

/**
 * Middle truncation, 6+6. For a hash every character is equally
 * distinguishing, so the reader's task is comparison rather than reading, and
 * truncating the middle maximises the independent positions the eye can check.
 * Six a side because git abbreviates to seven and lengthens to stay unique —
 * four was below the honest floor for a ledger that keeps growing.
 */
function truncate(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

export function Hash({ value, full = false, label }: HashProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const name = label ?? "Value";

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <>
      <button
        type="button"
        className={styles.hash}
        title={value}
        aria-label={`Copy ${name.toLowerCase()}`}
        data-hash="true"
        data-hash-full={value}
        onClick={() => void handleCopy()}
      >
        {full ? value : truncate(value)}
      </button>
      {/* Names what was copied rather than flashing: a 200ms flash is invisible
          to a screen reader and ambiguous when several hashes sit together. */}
      <span className={styles.live} role="status" aria-live="polite">
        {copied ? `${name} copied` : ""}
      </span>
    </>
  );
}
