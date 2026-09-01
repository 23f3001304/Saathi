import type { JSX } from "react";
import styles from "./QuarantinedText.module.css";

type QuarantinedTextProps = {
  content: string;
  clamp?: boolean;
};

/**
 * §2.1/§7.4 — the poisoned string, shown but never actionable:
 * `user-select:none`, `tabindex=-1`, announced as evidence, not an instruction.
 */
export function QuarantinedText({
  content,
  clamp = false,
}: QuarantinedTextProps): JSX.Element {
  return (
    <p
      className={
        clamp ? `${styles.quarantined} ${styles.clamped}` : styles.quarantined
      }
      tabIndex={-1}
      aria-label="quarantined text, shown as evidence"
    >
      {content}
    </p>
  );
}
