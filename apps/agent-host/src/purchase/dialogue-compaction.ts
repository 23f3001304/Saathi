import type { Turn } from "./dialogue.js";

/**
 * Rolling compaction of the dialogue the planner reads.
 *
 * The recall replays verbatim lines, and an errand's committed answer is a
 * paragraph — so a long chat was two dozen paragraphs of prompt, most of them
 * about work already finished. The tail stays verbatim, because "yes" needs
 * its antecedent word for word; everything older folds into one short line.
 *
 * DECISION: shell-composed, never a model leg. The load-bearing facts of a
 * conversation live in the structured working context — the cards, the pick,
 * the park — so the summary is allowed to be lossy about prose, and a
 * deterministic clamp is lossy in a way that cannot invent anything. A model
 * pass would buy fluency at the price of a second unstreamed leg per turn and
 * one more place a turn can fail before the shopper hears anything.
 *
 * DECISION: folded once and stored, never recomputed. The watermark (`folded`)
 * is the instant of the newest folded line, so a line is read for folding on
 * exactly one turn of its life — and a line that later scrolls past the recall
 * limit is still in the stored summary, which a recomputation would have lost.
 */
export const TAIL_KEPT = 10;

/** Past this the summary itself would become the long transcript it replaces;
 *  the oldest clauses are dropped from the front. */
export const SUMMARY_CEILING = 700;

const LINE_CLAMP = 90;

const JOIN = " · ";

export interface Compacted {
  readonly summary: string | null;
  readonly folded: string | null;
}

/** The lines not yet folded into the summary — what the planner still reads
 *  verbatim. Everything at or before the watermark lives in the summary. */
export function unfolded(
  dialogue: readonly Turn[],
  folded: string | null,
): readonly Turn[] {
  if (folded === null) return dialogue;
  return dialogue.filter((line) => line.at > folded);
}

/** No leading `key:` shape on purpose — a colon-labelled line would read as a
 *  trait wherever traits share the prompt. */
function clauseOf(line: Turn): string {
  const flat = line.text.replace(/\s+/gu, " ").trim();
  const clamped =
    flat.length > LINE_CLAMP ? `${flat.slice(0, LINE_CLAMP).trimEnd()}…` : flat;
  return `${line.speaker === "user" ? "(them)" : "(you)"} ${clamped}`;
}

/** Oldest clauses go first, and go first when the ceiling cuts. */
function clamped(summary: string): string {
  if (summary.length <= SUMMARY_CEILING) return summary;
  const kept = summary.slice(summary.length - SUMMARY_CEILING);
  const clean = kept.indexOf(JOIN);
  return `…${clean >= 0 ? kept.slice(clean + JOIN.length) : kept}`;
}

/** Where the verbatim tail begins. Never splits an instant: two lines written
 *  in the same moment fold together or stay together, so the watermark's
 *  `at > folded` reading is exact. */
function boundaryOf(fresh: readonly Turn[]): number {
  let cut = fresh.length - TAIL_KEPT;
  while (cut > 0 && fresh[cut]?.at === fresh[cut - 1]?.at) {
    cut -= 1;
  }
  return cut;
}

/**
 * Fold everything older than the tail into the stored summary. Idempotent
 * across turns: only lines newer than the previous watermark are read at all.
 */
export function foldInto(
  previous: Compacted,
  dialogue: readonly Turn[],
): Compacted {
  const fresh = unfolded(dialogue, previous.folded);
  const cut = boundaryOf(fresh);
  if (cut <= 0) return previous;
  const folding = fresh.slice(0, cut);
  const grown = [previous.summary ?? "", ...folding.map(clauseOf)]
    .filter((clause) => clause !== "")
    .join(JOIN);
  const last = folding[folding.length - 1];
  return {
    summary: clamped(grown),
    folded: last?.at ?? previous.folded,
  };
}
