import type { JSX } from "react";
import { HoldToSign } from "./HoldToSign.tsx";
import { useReducedMotion } from "../motion/useReducedMotion.ts";
import styles from "./AmendmentFooter.module.css";

type AmendmentFooterProps = {
  unsignedCount: number;
  onOpenSheet: () => void;
};

/**
 * §2.2 — the label once promised a hold over a control that opened on a click.
 * Holding it now lays the kolam down and opens O1, where the real signature
 * is taken; the gesture the footer promises is the gesture it asks for.
 */
export function AmendmentFooter({
  unsignedCount,
  onOpenSheet,
}: AmendmentFooterProps): JSX.Element {
  const reduced = useReducedMotion();

  return (
    <div className={styles.footer}>
      <span className={styles.count}>
        {unsignedCount} change{unsignedCount === 1 ? "" : "s"}, unsigned.
        Nothing takes effect until you sign.
      </span>
      <HoldToSign
        stage="idle"
        reducedMotion={reduced}
        disabled={unsignedCount === 0}
        label="hold to sign"
        onComplete={onOpenSheet}
      />
    </div>
  );
}
