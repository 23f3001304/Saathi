// What a draft becomes when it turns out not to be the answer.
//
// DECISION (replacing "delete it"): a browsing turn writes a preamble per tool
// round, all into one bubble, so a shopper's question rewrote itself six times
// — "what will you use it for?" became "I'm checking Amazon" became a search
// result. But a superseded draft is not nothing: it is the model's own true
// account of what it was doing, and "Amazon's home page did not expose its
// search box, so I'm opening the results page directly" is exactly what the
// work strip is for. It lands there, and the bubble is left for the answer.
import type { ChatEntry } from "./chatEntry.ts";

type AgentEntry = Extract<ChatEntry, { kind: "agent" }>;

/**
 * The strip is reopened rather than appended to: it was closed by the very
 * delta that opened this draft, and the draft is going back into it.
 */
export function supersede(
  entries: readonly ChatEntry[],
  at: number,
  held: AgentEntry,
): ChatEntry[] {
  const kept = entries.filter((_entry, index) => index !== at);
  const text = held.text.trim();
  if (text === "" || held.streamId === undefined) return kept;
  // DECISION (replacing "it lands in the work strip"): a superseded draft is
  // THINKING, not work. As a work activity it wore a tick in the step list,
  // which says "the host did this" - and a live turn that reworded its own
  // question seven times showed seven ticked pills of the same question, as
  // if seven things had happened. Nothing had. It goes where the rest of the
  // working goes: the collapsed block, open to whoever wants it.
  return [...kept, { kind: "agent", text, thinking: true }];
}

/**
 * A new round is starting over prose the last one left standing.
 *
 * DECISION: only a draft still LIVE is taken away here. A settled draft is a
 * finished utterance waiting for the harness to commit the same words, and
 * folding it on the next delta raced that commit: the fold won, `speak` then
 * found nothing to claim and appended a second copy, and every sentence in
 * the conversation appeared twice - once as thinking, once as itself. Live
 * prose the model wrote past is genuinely abandoned and still goes.
 */
export function openDraft(entries: readonly ChatEntry[]): ChatEntry[] {
  // Nothing is folded here any more. Folding on the next delta raced the
  // harness's commit of the same words: the fold won, `speak` found nothing
  // to claim, and every sentence appeared twice - once as thinking, once as
  // itself. The commit tidies instead (`settleSpoken`), because only the
  // commit knows which draft turned out to be the answer.
  return [...entries];
}
