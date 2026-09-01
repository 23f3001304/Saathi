import type { CSSProperties, JSX } from "react";

const PIGMENTS = ["#E9A23B", "#1B857E", "#D95B2B", "#363499", "#B23A63"];
import { SaathiMark } from "../chrome/SaathiMark.tsx";
import styles from "./Greeting.module.css";

/**
 * The opening ceremony. The mark draws itself in one continuous stroke -
 * the same gesture as a kolam laid at a doorstep at dawn: a welcome, drawn
 * fresh, before anything is asked of you. Then the greeting rises, then the
 * first question. After the first answer the whole thing steps aside.
 */
export function Greeting(): JSX.Element {
  return (
    <div className={styles.greeting} aria-hidden="true">
      <SaathiMark size={56} className={styles.mark} />
      <p className={styles.namaste} aria-label="Namaste.">
        {[..."Namaste."].map((ch, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={styles.letter}
            style={
              {
                "--i": i,
                "--pigment": PIGMENTS[i % PIGMENTS.length],
              } as CSSProperties
            }
          >
            {ch}
          </span>
        ))}
      </p>
      <p className={styles.line}>I read your shop. You hold the pen.</p>
      <p className={styles.ask}>What would you like to know?</p>
    </div>
  );
}
