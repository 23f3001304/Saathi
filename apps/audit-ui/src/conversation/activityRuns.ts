// A live run writes the same line many times over: ten identical
// "Memory rejected at P0 · R0.tier-permission · TYPE_REQUIRES_HIGHER_TIER"
// pills are one fact about how the gate behaves, not ten things to read.
// Consecutive repeats fold into one row carrying its count; nothing is
// dropped, and opening the row still shows every occurrence.
import type { Activity } from "./assistantScript.ts";

export type ActivityRun = {
  readonly id: string;
  readonly text: string;
  readonly members: readonly Activity[];
};

export function groupRuns(
  activities: readonly Activity[],
): readonly ActivityRun[] {
  const runs: ActivityRun[] = [];
  for (const activity of activities) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.text === activity.text) {
      runs[runs.length - 1] = {
        ...last,
        members: [...last.members, activity],
      };
      continue;
    }
    runs.push({ id: activity.id, text: activity.text, members: [activity] });
  }
  return runs;
}
