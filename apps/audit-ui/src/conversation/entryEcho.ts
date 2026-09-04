import type { ChatEntry } from "./chatEntry.ts";

/**
 * A superseded round left the very sentence being asked in the work strip —
 * the planner wrote the question twice and the first copy became a pill. A
 * pill that repeats the composer verbatim records nothing; it goes, and a
 * strip it leaves empty goes with it.
 */
export function dropEcho(entries: readonly ChatEntry[], text: string): ChatEntry[] {
  const at = entries.length - 1;
  const last = entries[at];
  if (last?.kind !== "work") return [...entries];
  const kept = last.activities.filter(
    (activity) => activity.text.trim() !== text.trim(),
  );
  if (kept.length === last.activities.length) return [...entries];
  if (kept.length === 0) return entries.slice(0, at);
  return [...entries.slice(0, at), { ...last, activities: kept }];
}
