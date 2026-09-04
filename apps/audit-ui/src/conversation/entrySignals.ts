// The entry folds: the signals that add, close or retire a transcript entry.
// Split from `assistantState.ts`, which is now only the dispatcher over these
// and the draft and field folds beside them.
import type { Activity } from "./assistantScript.ts";
import type { ChatEntry } from "./chatEntry.ts";
import { claimQuietly, closeDrafts, speak } from "./draftEntries.ts";
import type { OptionRowData } from "./chatScript.ts";
import type { AssistantSignal } from "./assistantTransport.ts";
import type { AssistantSnapshot } from "./assistantSnapshot.ts";
import { dropEcho } from "./entryEcho.ts";

export type EntrySignal = Extract<
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

export function closeWork(entries: ChatEntry[]): ChatEntry[] {
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
  // A fresh set supersedes the old choice: nothing on this table has been
  // taken yet, and a stale pick would arm the dock for a card that is gone.
  const table = { ...state, options, picked: null, offering: true };
  return { ...table, entries: [...kept, offer] };
}

/**
 * A live question renders at the composer and nowhere else — that is the
 * product rule, and printing it as a bubble too was the repeat the shopper
 * called out. The draft the question was streamed as is claimed off the
 * screen, an echo of it in the work strip goes with it, and the prompt
 * returns to the transcript as history the moment it is answered — see the
 * `buyer` case below.
 */
/** Drops the run of thinking at the tail, and nothing before it. */
function withoutTrailingThoughts(entries: readonly ChatEntry[]): ChatEntry[] {
  const kept = [...entries];
  while (kept.length > 0) {
    const last = kept[kept.length - 1];
    if (last?.kind !== "agent" || last.thinking !== true) break;
    kept.pop();
  }
  return kept;
}

function applyAsk(
  state: AssistantSnapshot,
  signal: Extract<AssistantSignal, { kind: "ask" }>,
): AssistantSnapshot {
  const { id, prompt, replies, groups } = signal;
  // The drafting of a question is not thinking worth keeping: it is the same
  // sentence, one rewrite earlier. A turn that ends by asking claims its own
  // trailing drafts, so the shopper sees the question once, at the composer,
  // instead of reading it in a Thinking block and again underneath.
  const held = withoutTrailingThoughts(claimQuietly(state.entries));
  const entries = dropEcho(closeWork(held), prompt);
  return { ...state, question: { id, prompt, replies, groups }, entries };
}

/** Speech closes the open work block rather than leaving it spinning. The
 *  same sentence must not stand in the strip AND as a bubble: an announce
 *  draft written past by later steps folds into a pill, and the say that
 *  duplicates it then rendered the sentence twice. The pill goes; the say
 *  still speaks (and `speak` claims a claimable settled draft itself). */
/** Unclaimed drafts are drafting: they go quiet, they do not stand as
 *  answers beside the one the harness actually spoke for. */
function settleSpoken(entries: readonly ChatEntry[]): ChatEntry[] {
  return entries.map((entry) =>
    entry.kind === "agent" && entry.draft !== undefined
      ? { kind: "agent", text: entry.text, thinking: true }
      : entry,
  );
}

function spoken(
  entries: readonly ChatEntry[],
  signal: Extract<AssistantSignal, { kind: "say" }>,
): ChatEntry[] {
  const held = dropEcho(closeWork([...entries]), signal.text);
  // Thinking is appended, never claimed onto the streamed draft: the draft
  // is where the ANSWER will land, and a working note taking its place
  // would leave the turn's conclusion with nowhere to go.
  if (signal.thinking === true) {
    return [...held, { kind: "agent", text: signal.text, thinking: true }];
  }
  // One bubble per commit: the draft this answer landed in keeps it, and any
  // other prose the model left standing this turn becomes thinking. Only the
  // commit can tell those apart, which is why it does the tidying.
  return settleSpoken(speak(held, signal.text, signal.system));
}

/** Their sentence starts the next turn: the answered question becomes
 *  history above it, and the last answer's cards are retired with it. */
function answered(
  state: AssistantSnapshot,
  signal: Extract<AssistantSignal, { kind: "buyer" }>,
): AssistantSnapshot {
    // The answered question becomes history: it was never a transcript
    // entry while live, so it is written in now, above the answer it got.
    const past = closeDrafts(state.entries);
    // A parked turn with nothing to ask is a real shape (§6.2): the composer
    // simply waits. Written in as history it was an empty bubble.
    const asked: ChatEntry[] =
      state.question === null || state.question.prompt.trim() === ""
        ? []
        : [{ kind: "agent", text: state.question.prompt }];
    return {
      ...state,
      question: null,
      running: true,
      // A new sentence retires the last answer's cards. They belonged to a
      // question that has been superseded: left standing they were offered
      // as choices for a search that had moved on, and the shelf's one
      // kurta sat under "I am checking the open web" as if it were a find.
      options: [],
      offering: false,
      entries: [...past, ...asked, { kind: "buyer", text: signal.text }],
    };
  
}

export function applyEntrySignal(
  state: AssistantSnapshot,
  signal: EntrySignal,
): AssistantSnapshot {
  switch (signal.kind) {
    case "ask":
      return applyAsk(state, signal);
    case "say":
      return { ...state, entries: spoken(state.entries, signal) };
    case "buyer":
      return answered(state, signal);
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

