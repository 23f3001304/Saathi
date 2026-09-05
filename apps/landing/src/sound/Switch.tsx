import type { JSX } from "react";
import { useSound } from "./SoundContext.tsx";
import styles from "./Switch.module.css";

/* The switch's own three words, kept here now that the acts (and the copy
   file they shared) are gone. */
const COPY = {
  on: "sound on",
  off: "sound off",
  label: "Toggle the show's sound",
} as const;

/** A footlight you can switch: fixed at the bottom right, off by default. */
export function Switch(): JSX.Element {
  const { on, toggle } = useSound();
  return (
    <button
      type="button"
      className={styles.switch}
      aria-pressed={on}
      aria-label={COPY.label}
      onClick={toggle}
    >
      <span className={styles.flame} aria-hidden="true" />
      <span className={styles.text}>{on ? COPY.on : COPY.off}</span>
    </button>
  );
}
