import { useState, type JSX } from "react";
import type { MemoryEntryView } from "../ledger/reducer.ts";
import { MemoryRow } from "./MemoryRow.tsx";
import styles from "./MemoryRail.module.css";

type MemoryRailProps = {
  memories: MemoryEntryView[];
  /** Tests and the print stylesheet want the table unfolded from the start. */
  defaultOpen?: boolean;
};

const TIER_RANK: Record<MemoryEntryView["tier"], number> = {
  P3: 3,
  P2: 2,
  P1: 1,
  P0: 0,
};

function sortMemories(memories: MemoryEntryView[]): MemoryEntryView[] {
  return [...memories].sort((a, b) => {
    const tierDelta = TIER_RANK[b.tier] - TIER_RANK[a.tier];
    if (tierDelta !== 0) return tierDelta;
    return new Date(a.t_created).getTime() - new Date(b.t_created).getTime();
  });
}

/** The row that held is the first signed P3 constraint once anything was rejected. */
function heldRowId(memories: MemoryEntryView[]): string | undefined {
  const anyRejected = memories.some((m) => m.outcome === "rejected");
  if (!anyRejected) return undefined;
  return memories.find((m) => m.tier === "P3" && m.type === "constraint")?.id;
}

/**
 * §2.1 — "what was considered and refused, which is the whole point."
 *
 * A five-column table of every consulted memory is the right artefact for
 * an auditor and far too much furniture for a buyer, so it folds: the rest
 * state is one line naming the count and the tiers, and the table is one
 * click behind it. Row content, ordering, the crimson barb on rejected
 * writes and the indigo barb on the constraint that held are unchanged.
 */
export function MemoryRail({
  memories,
  defaultOpen = false,
}: MemoryRailProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sorted = sortMemories(memories);
  const held = heldRowId(memories);
  const tiers = sorted.map((m) => m.tier).join(" ");

  return (
    <div className={styles.rail}>
      <button
        type="button"
        className={styles.digest}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-memory-digest="true"
      >
        <span className={styles.count}>
          {sorted.length} {sorted.length === 1 ? "memory" : "memories"}
        </span>
        {tiers !== "" && <span className={styles.tiers}>{tiers}</span>}
        <span className={styles.more}>{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div
          className={styles.table}
          role="table"
          aria-label="Memories consulted"
        >
          <div className={styles.header} role="row">
            <span>Type</span>
            <span>Tier</span>
            <span>Age</span>
            <span>Content</span>
            <span>Hash</span>
          </div>
          {sorted.map((entry) => (
            <MemoryRow
              key={entry.id}
              entry={entry}
              held={entry.id === held}
              expanded={expandedId === entry.id}
              onToggle={() =>
                setExpandedId((id) => (id === entry.id ? null : entry.id))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
