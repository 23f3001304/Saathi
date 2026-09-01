import { useState, type JSX, type ReactNode } from "react";
import styles from "./ChainSection.module.css";

export type StepState = "done" | "active" | "pending" | "blocked";

type ChainSectionProps = {
  index: number;
  title: string;
  meta?: string;
  /** One plain sentence carrying the substance while the step is folded. */
  summary?: string;
  state?: StepState;
  defaultOpen?: boolean;
  children: ReactNode;
};

function Marker({ state }: { state: StepState }): JSX.Element {
  return (
    <span className={`${styles.marker} ${styles[state]}`} aria-hidden="true">
      {state === "done" && (
        <svg viewBox="0 0 12 12">
          <path d="M2.5 6.2 4.8 8.6 9.5 3.4" />
        </svg>
      )}
      {state === "blocked" && (
        <svg viewBox="0 0 12 12">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      )}
    </span>
  );
}

/**
 * A step in the run, the way assistants show finished research: a marker on
 * a spine, a plain title, the substance in one line, and the full detail one
 * click away. Done steps rest folded; what happened is still legible at a
 * glance because the summary does the carrying.
 */
export function ChainSection({
  title,
  meta,
  summary,
  state = "done",
  defaultOpen = false,
  children,
}: ChainSectionProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={styles.step} data-instrument="true">
      <span className={styles.rail} aria-hidden="true" />
      <Marker state={state} />
      <button
        type="button"
        className={styles.head}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.title}>{title}</span>
        {!open && summary !== undefined && (
          <span className={styles.summary}>{summary}</span>
        )}
        <span className={styles.headRight}>
          {meta !== undefined && <span className={styles.meta}>{meta}</span>}
          <svg
            viewBox="0 0 12 12"
            className={
              open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron
            }
            aria-hidden="true"
          >
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </span>
      </button>
      {open && <div className={styles.body}>{children}</div>}
    </section>
  );
}
