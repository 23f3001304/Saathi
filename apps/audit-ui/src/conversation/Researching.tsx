import type { JSX } from "react";
import styles from "./Researching.module.css";

export type ResearchStep = { key: string; label: string };

type ResearchingProps = {
  /** What the agent is doing right now, in the agent's own voice. */
  label: string;
  steps: ResearchStep[];
  /** Index of the step in flight; everything before it is done. */
  activeIndex: number;
};

/** A continuous kolam wave — alternating radii, so it never reads as a spinner. */
const ARCS = [
  { d: "M2 20 A9 9 0 0 1 20 20", delay: 0 },
  { d: "M20 20 A11 11 0 0 0 42 20", delay: 0.11 },
  { d: "M42 20 A7 7 0 0 1 56 20", delay: 0.22 },
  { d: "M56 20 A12 12 0 0 0 80 20", delay: 0.33 },
];

/**
 * The agent working, drawn as the thread it is about to commit to the ledger.
 * A spinner says "loading"; this says "weaving something you will be able to
 * check afterwards", and the pills say exactly which part is being woven —
 * so waiting is informative rather than merely tolerated.
 */
export function Researching({
  label,
  steps,
  activeIndex,
}: ResearchingProps): JSX.Element {
  return (
    <section className={styles.card} role="status" aria-live="polite">
      <div className={styles.head}>
        <svg className={styles.thread} viewBox="0 0 82 40" aria-hidden="true">
          {ARCS.map((arc) => (
            <path
              key={arc.d}
              d={arc.d}
              className={styles.arc}
              style={{ animationDelay: `${arc.delay}s` }}
            />
          ))}
        </svg>
        <span className={styles.label}>{label}</span>
      </div>
      <ol className={styles.pills}>
        {steps.map((step, i) => {
          const state =
            i < activeIndex
              ? styles.done
              : i === activeIndex
                ? styles.active
                : styles.waiting;
          return (
            <li key={step.key} className={`${styles.pill} ${state}`}>
              {i < activeIndex && (
                <svg
                  viewBox="0 0 12 12"
                  className={styles.tick}
                  aria-hidden="true"
                >
                  <path d="M2.5 6.2 4.8 8.6 9.5 3.4" />
                </svg>
              )}
              {step.label}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
