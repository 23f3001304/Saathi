// What a draft becomes when it turns out not to be the answer.
//
// DECISION (replacing "delete it"): a browsing turn writes a preamble per tool
// round, all into one bubble, so a shopper's question rewrote itself six times
// — "what will you use it for?" became "I'm checking Amazon" became a search
// result. But a superseded draft is not nothing: it is the model's own true
// account of what it was doing, and "Amazon's home page did not expose its
// search box, so I'm opening the results page directly" is exactly what the
// work strip is for. It lands there, and the bubble is left for the answer.
import type { Activity } from "./assistantScript.ts";
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
  const activity: Activity = { id: held.streamId, text, afterMs: 0 };
  const last = kept[kept.length - 1];
  if (last?.kind !== "work") {
    return [...kept, { kind: "work", activities: [activity], done: false }];
  }
  return [
    ...kept.slice(0, -1),
    { kind: "work", activities: [...last.activities, activity], done: false },
  ];
}

/**
 * A new round is starting, and the round before left prose standing that the
 * harness never spoke for. That is the same fact as an empty-reason withdrawal
 * — the model wrote past its own preamble — and the live host produces both:
 * one turn withdrew two drafts and settled four more, and all six reached the
 * shopper as one sentence changing its mind. A settled draft a `message` has
 * already claimed carries no `draft` any more; that one is an answer and stays.
 */
export function openDraft(entries: readonly ChatEntry[]): ChatEntry[] {
  const at = entries.length - 1;
  const last = entries[at];
  if (last?.kind !== "agent" || last.draft !== "final" || last.system === true)
    return [...entries];
  return supersede(entries, at, last);
}
