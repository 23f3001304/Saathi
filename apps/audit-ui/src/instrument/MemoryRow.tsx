import type { JSX, KeyboardEvent } from "react";
import type { MemoryEntryView } from "../ledger/reducer.ts";
import { TierChip } from "../primitives/TierChip.tsx";
import { Hash } from "../primitives/Hash.tsx";
import { relativeTime } from "../primitives/Timestamp.tsx";
import styles from "./MemoryRow.module.css";

type MemoryRowProps = {
  entry: MemoryEntryView;
  held?: boolean;
  expanded: boolean;
  onToggle: () => void;
};

function handleKeyDown(
  e: KeyboardEvent<HTMLDivElement>,
  onToggle: () => void,
): void {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onToggle();
  }
}

/**
 * §2.1/§6.4 — rejected writes stay in place, greyed, with a crimson left
 * barb. A `<div role="button">`, not a real button: Hash below is its own
 * (copy) button, and buttons can't nest.
 */
export function MemoryRow({
  entry,
  held = false,
  expanded,
  onToggle,
}: MemoryRowProps): JSX.Element {
  const rejected = entry.outcome === "rejected";
  const classes = [
    styles.row,
    rejected ? styles.rejected : "",
    held ? styles.held : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => handleKeyDown(e, onToggle)}
      aria-expanded={expanded}
    >
      <span className={styles.type}>{entry.type}</span>
      <TierChip tier={entry.tier} rejected={rejected} />
      <span className={styles.age}>
        {relativeTime(entry.t_created, Date.now())}
      </span>
      <span
        className={
          expanded ? `${styles.content} ${styles.expanded}` : styles.content
        }
      >
        {entry.content}
      </span>
      <Hash value={entry.hash} />
      {expanded && (
        <span className={styles.bitemporal}>
          valid {entry.t_valid} → {entry.t_invalid ?? "open"} · created{" "}
          {entry.t_created} → {entry.t_expired ?? "open"}
        </span>
      )}
    </div>
  );
}
