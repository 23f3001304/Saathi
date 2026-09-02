import { useEffect, useRef, useState, type JSX } from "react";
import { animate } from "motion";
import { EASE } from "../motion/presets.ts";
import { useReducedMotion } from "../motion/useReducedMotion.ts";
import type { Activity } from "./assistantScript.ts";
import { groupRuns, type ActivityRun } from "./activityRuns.ts";
import styles from "./ActivityStream.module.css";

export type ThinkingMode = "summary" | "normal" | "verbose";

type ActivityStreamProps = {
  activities: Activity[];
  done: boolean;
  mode: ThinkingMode;
  onMode: (mode: ThinkingMode) => void;
  /** The agent's inner line for the activity in flight (verbose only). */
  thinking?: string;
};

const MODES: ThinkingMode[] = ["summary", "normal", "verbose"];

/** What the buyer is choosing between, in their words rather than the code's. */
const MODE_LABEL: Record<ThinkingMode, string> = {
  summary: "just the latest",
  normal: "the steps",
  verbose: "everything",
};

function Pill({
  text,
  latest,
  settled,
  count = 1,
}: {
  text: string;
  latest: boolean;
  settled: boolean;
  count?: number;
}): JSX.Element {
  const ref = useRef<HTMLLIElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (ref.current === null) return;
    if (reduced) {
      animate(
        ref.current,
        { opacity: [0, 1] },
        { duration: 0.1, ease: "linear" },
      );
      return;
    }
    animate(
      ref.current,
      {
        opacity: [0, 1],
        transform: ["translateY(8px) scale(0.96)", "translateY(0px) scale(1)"],
      },
      { duration: 0.3, ease: EASE.stamp },
    );
  }, [reduced]);

  const cls = settled
    ? `${styles.pill} ${styles.settled}`
    : latest
      ? `${styles.pill} ${styles.live}`
      : styles.pill;
  return (
    <li ref={ref} className={cls}>
      {settled ? (
        <svg viewBox="0 0 12 12" className={styles.tick} aria-hidden="true">
          <path d="M2.5 6.2 4.8 8.6 9.5 3.4" />
        </svg>
      ) : (
        <span className={styles.spark} aria-hidden="true" />
      )}
      {text}
      {count > 1 && <span className={styles.count}>&times;{count}</span>}
    </li>
  );
}

/** A folded run opens in place; the count is the affordance and the summary. */
function Run({
  run,
  latest,
  done,
}: {
  run: ActivityRun;
  latest: boolean;
  done: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  if (run.members.length === 1 || open) {
    return (
      <>
        {run.members.map((member, i) => (
          <Pill
            key={member.id}
            text={member.text}
            latest={latest && i === run.members.length - 1}
            settled={!(latest && i === run.members.length - 1)}
          />
        ))}
      </>
    );
  }
  return (
    <button
      type="button"
      className={styles.foldOpen}
      onClick={() => setOpen(true)}
      aria-label={`Show all ${run.members.length}: ${run.text}`}
    >
      <Pill
        text={run.text}
        latest={latest && !done}
        settled={!latest || done}
        count={run.members.length}
      />
    </button>
  );
}

/**
 * The agent's work, streaming: each act lands as a pill the moment it
 * happens, shimmers while it is the latest, and settles to a tick when the
 * next one arrives. The list never resets and never loops — it is a record
 * accumulating, which is the whole product in miniature.
 */
export function ActivityStream({
  activities,
  done,
  mode,
  onMode,
  thinking,
}: ActivityStreamProps): JSX.Element {
  const latest = activities[activities.length - 1];
  const shown =
    mode === "summary" && latest !== undefined ? [latest] : activities;
  // Verbose means every line, in order: folding is exactly what it turns off.
  const runs = mode === "verbose" ? null : groupRuns(shown);

  return (
    <section className={styles.work} aria-live="polite">
      <header className={styles.workHead}>
        <span className={styles.workLabel}>
          {/* "Working…" said nothing; the latest step is what is happening. */}
          {done
            ? `Done · ${activities.length} steps`
            : latest === undefined
              ? "Working…"
              : `Working · ${latest.text.slice(0, 64)}`}
        </span>
        <div className={styles.modes} role="group" aria-label="How much to show">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={
                m === mode ? `${styles.mode} ${styles.modeOn}` : styles.mode
              }
              onClick={() => onMode(m)}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </header>
      <ol className={styles.stream} role="log">
        {runs !== null &&
          runs.map((run) => (
            <Run
              key={run.id}
              run={run}
              latest={
                latest !== undefined && run.members.includes(latest) && !done
              }
              done={done}
            />
          ))}
        {runs === null &&
          shown.map((activity) => {
            const isLatest = activity === latest && !done;
            return (
              <Pill
                key={activity.id}
                text={activity.text}
                latest={isLatest}
                settled={!isLatest}
              />
            );
          })}
      </ol>
      {mode === "verbose" && thinking !== undefined && !done && (
        <p className={styles.thinking}>{thinking}</p>
      )}
    </section>
  );
}
