// The fold: signals in, chat entries out. Pure, so the same reduction runs in
// a test over recorded agent-host beats with no React tree.
import type { Activity } from "./assistantScript.ts";
import type { ChatEntry } from "./chatEntry.ts";
import {
  applyDraft,
  claimQuietly,
  closeDrafts,
  isDraftSignal,
  speak,
} from "./draftEntries.ts";
import type { OptionRowData } from "./chatScript.ts";
import type { AssistantSignal } from "./assistantTransport.ts";
import type { AssistantSnapshot } from "./assistantSnapshot.ts";
import { applyFieldSignal } from "./fieldSignals.ts";

export type { ChatEntry, DraftPhase } from "./chatEntry.ts";

export type {
  AssistantSnapshot,
  CovenantView,
  Question,
} from "./assistantSnapshot.ts";
export { emptySnapshot } from "./assistantSnapshot.ts";
import { emptySnapshot as empty } from "./assistantSnapshot.ts";

type EntrySignal = Extract<
  AssistantSignal,
  { kind: "say" | "ask" | "buyer" | "activity" | "work-done" | "offer" }
>;

/** Activities accumulate into the open work block; anything else closes it, so
 *  an activity after a bubble opens a fresh block rather than reopening a
 *  settled one. The record stays in wire order either way. */
function pushActivity(entries: ChatEntry[], activity: Activity): ChatEntry[] {
  const last = entries[entries.length - 1];
  if (last?.kind === "work" && !last.done)
    return [
      ...entries.slice(0, -1),
      { kind: "work", activities: [...last.activities, activity], done: false },
    ];
  return [...entries, { kind: "work", activities: [activity], done: false }];
}

function closeWork(entries: ChatEntry[]): ChatEntry[] {
  const last = entries[entries.length - 1];
  if (last?.kind !== "work" || last.done) return entries;
  return [...entries.slice(0, -1), { ...last, done: true }];
}

/**
 * One live option set, and a line where the last one was.
 *
 * Re-offering used to swap the rows inside the existing block, which left the
 * cards sitting above prose written after them and quietly erased the fact
 * that an earlier set had been weighed at all. The old block collapses to
 * "N considered earlier" and the new one opens at the bottom, where the
 * conversation actually is.
 */
function foldOffer(entries: readonly ChatEntry[], was: number): ChatEntry[] {
  const at = entries.findLastIndex((entry) => entry.kind === "offer");
  if (at === -1) return [...entries];
  const folded: ChatEntry = { kind: "folded", considered: was };
  return entries.map((entry, index) => (index === at ? folded : entry));
}

function withOffer(
  state: AssistantSnapshot,
  options: OptionRowData[],
): AssistantSnapshot {
  const closed = closeWork(state.entries);
  const offer: ChatEntry = { kind: "offer" };
  const kept = state.offering ? foldOffer(closed, state.options.length) : closed;
  return { ...state, options, offering: true, entries: [...kept, offer] };
}

/**
 * A superseded round left the very sentence being asked in the work strip —
 * the planner wrote the question twice and the first copy became a pill. A
 * pill that repeats the composer verbatim records nothing; it goes, and a
 * strip it leaves empty goes with it.
 */
function dropEcho(entries: readonly ChatEntry[], text: string): ChatEntry[] {
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

/**
 * A live question renders at the composer and nowhere else — that is the
 * product rule, and printing it as a bubble too was the repeat the shopper
 * called out. The draft the question was streamed as is claimed off the
 * screen, an echo of it in the work strip goes with it, and the prompt
 * returns to the transcript as history the moment it is answered — see the
 * `buyer` case below.
 */
function applyAsk(
  state: AssistantSnapshot,
  signal: Extract<AssistantSignal, { kind: "ask" }>,
): AssistantSnapshot {
  const { id, prompt, replies, groups } = signal;
  const entries = dropEcho(closeWork(claimQuietly(state.entries)), prompt);
  return { ...state, question: { id, prompt, replies, groups }, entries };
}

/** Speech closes the open work block rather than leaving it spinning. The
 *  same sentence must not stand in the strip AND as a bubble: an announce
 *  draft written past by later steps folds into a pill, and the say that
 *  duplicates it then rendered the sentence twice. The pill goes; the say
 *  still speaks (and `speak` claims a claimable settled draft itself). */
function spoken(
  entries: readonly ChatEntry[],
  signal: Extract<AssistantSignal, { kind: "say" }>,
): ChatEntry[] {
  const held = dropEcho(closeWork([...entries]), signal.text);
  return speak(held, signal.text, signal.system);
}

function applyEntrySignal(
  state: AssistantSnapshot,
  signal: EntrySignal,
): AssistantSnapshot {
  switch (signal.kind) {
    case "ask":
      return applyAsk(state, signal);
    case "say":
      return { ...state, entries: spoken(state.entries, signal) };
    case "buyer": {
      // The answered question becomes history: it was never a transcript
      // entry while live, so it is written in now, above the answer it got.
      const past = closeDrafts(state.entries);
      const asked: ChatEntry[] =
        state.question === null
          ? []
          : [{ kind: "agent", text: state.question.prompt }];
      return {
        ...state,
        question: null,
        running: true,
        entries: [...past, ...asked, { kind: "buyer", text: signal.text }],
      };
    }
    case "activity":
      return {
        ...state,
        entries: pushActivity(state.entries, signal.activity),
      };
    case "work-done":
      return { ...state, entries: closeWork(state.entries) };
    default:
      return withOffer(state, signal.options);
  }
}

const ENTRY_KINDS: readonly string[] = [
  "say",
  "ask",
  "buyer",
  "activity",
  "work-done",
  "offer",
];

function isEntrySignal(signal: AssistantSignal): signal is EntrySignal {
  return ENTRY_KINDS.includes(signal.kind);
}

export function applySignal(
  state: AssistantSnapshot,
  signal: AssistantSignal,
): AssistantSnapshot {
  if (isDraftSignal(signal))
    return { ...state, entries: applyDraft(closeWork(state.entries), signal) };
  if (isEntrySignal(signal)) return applyEntrySignal(state, signal);
  return applyFieldSignal(state, signal);
}

export function reduceSignals(
  signals: readonly AssistantSignal[],
  from: AssistantSnapshot = empty,
): AssistantSnapshot {
  return signals.reduce(applySignal, from);
}
