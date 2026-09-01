import type { CSSProperties, JSX } from "react";
import styles from "./Wordmark.module.css";

/*
 * DECISION: the wordmark is the product's staggered-character arrival
 * (StreamText's exact signature, promoted to display scale): each letter
 * lands 76ms after the last, wet with one of the five pigments, and dries
 * to ink. In the hero it arrives once and then answers the cursor (see
 * useInkPressure); in the footer it bookends the page and re-inks pigment
 * by pigment under a hover. Same letters, same pigments, both doors of the
 * house.
 */
const PIGMENTS = [
  "var(--pigment-1)",
  "var(--pigment-2)",
  "var(--pigment-3)",
  "var(--pigment-4)",
  "var(--pigment-5)",
];

const NAME = "Saathi";

export function Wordmark({
  mode,
  className,
}: {
  mode: "hero" | "footer";
  className?: string;
}): JSX.Element {
  const cls = [
    styles.wordmark,
    mode === "hero" ? styles.hero : styles.footer,
    className ?? "",
  ].join(" ");
  return (
    <span className={cls} aria-label={NAME} role="text">
      {Array.from(NAME).map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-letter
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
    </span>
  );
}
