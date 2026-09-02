/**
 * Who said a line. The two halves are kept apart all the way through, not
 * merged into one blob of text, because only one of them may bound anything:
 * an intent is drafted from what the *shopper* stated, and the agent's own
 * prose must never become the source of a bound it then honours.
 */
export type Speaker = "user" | "agent";

export interface ConversationLine {
  readonly speaker: Speaker;
  readonly text: string;
}

/**
 * `[them]` and `[you]`, not `them:` and `you:`. Durable traits reach the same
 * prompt as `key: value` lines, so a colon-shaped label would read as a trait
 * called "them" whose value was whatever they last typed.
 */
const LABELS: Readonly<Record<Speaker, string>> = {
  user: "[them]",
  agent: "[you]",
};

/** The dialogue as the planner reads it: in order, speaker marked. */
export function transcriptOf(
  lines: readonly ConversationLine[],
): readonly string[] {
  return lines.map((line) => `${LABELS[line.speaker]} ${line.text}`);
}

/** The shopper's half alone — the only half an intent may be drafted from. */
export function shopperLines(
  lines: readonly ConversationLine[],
): readonly string[] {
  return lines.filter((line) => line.speaker === "user").map((l) => l.text);
}

/**
 * Saying the same thing twice is one line, not two. Every turn writes its own
 * row (the predicate carries the instant, so nothing supersedes), and a shopper
 * who repeats themselves — or a run restarted with the same sentence — had that
 * line stacked into the intent once per repetition.
 *
 * The key carries the speaker: an agent that echoes the shopper's own words
 * back at them said something, and dropping it would take the antecedent away
 * from the "yes" that follows.
 */
export function recent<T extends ConversationLine>(
  lines: readonly T[],
  limit: number,
): readonly T[] {
  // Newest occurrence wins. Deduplicating forward kept the FIRST "yes" and
  // dropped the one the shopper just typed, so the planner never saw the
  // confirmation and asked the same question again.
  const seen = new Set<string>();
  const unique: T[] = [];
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    const line = lines[at] as T;
    const key = `${line.speaker}:${line.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.unshift(line);
  }
  return unique.slice(-limit);
}

/** A line with the instant it was written, for ordering a recall. */
export interface Turn extends ConversationLine {
  readonly at: string;
}

export interface RecalledEntry {
  readonly content: Readonly<Record<string, unknown>>;
  readonly t_created: string;
}

export function lineOf(
  speaker: Speaker | null,
  entry: RecalledEntry,
): Turn | null {
  const value = entry.content["text"];
  const text = typeof value === "string" ? value.trim() : "";
  if (speaker === null || text.length === 0) return null;
  return { speaker, text, at: entry.t_created };
}

/** Within one instant the shopper spoke first: the agent's line is a reply. */
const ORDER: Readonly<Record<Speaker, number>> = { user: 0, agent: 1 };

export function byTime(left: Turn, right: Turn): number {
  const byInstant = left.at.localeCompare(right.at);
  return byInstant !== 0
    ? byInstant
    : ORDER[left.speaker] - ORDER[right.speaker];
}
