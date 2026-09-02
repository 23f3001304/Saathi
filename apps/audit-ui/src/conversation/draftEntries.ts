// A streamed answer as it lands in the transcript.
//
// The rule the folding keeps: a draft is prose on a screen, never a verdict.
// It grows while the model writes it, and what happens to it next is the
// harness's word — the `message` beat that follows replaces it with the text
// the run stands behind, and a withdrawn draft leaves rather than being
// silently rewritten into something the shopper never read.
import type { AssistantSignal } from "./assistantTransport.ts";
import type { ChatEntry } from "./chatEntry.ts";
import { openDraft, supersede } from "./draftWork.ts";

export const WITHDRAWN_PREFIX = "Withdrawn";

function draftAt(entries: readonly ChatEntry[], streamId: string): number {
  return entries.findIndex(
    (entry) => entry.kind === "agent" && entry.streamId === streamId,
  );
}

function replaceAt(
  entries: readonly ChatEntry[],
  at: number,
  entry: ChatEntry,
): ChatEntry[] {
  return entries.map((held, index) => (index === at ? entry : held));
}

function appendDelta(
  entries: readonly ChatEntry[],
  streamId: string,
  text: string,
): ChatEntry[] {
  const at = draftAt(entries, streamId);
  const held = entries[at];
  if (at === -1 || held?.kind !== "agent") {
    const open = openDraft(entries);
    return [...open, { kind: "agent", text, streamId, draft: "live" }];
  }
  return replaceAt(entries, at, { ...held, text: held.text + text });
}

function settleDraft(
  entries: readonly ChatEntry[],
  streamId: string,
): ChatEntry[] {
  const at = draftAt(entries, streamId);
  const held = entries[at];
  if (at === -1 || held?.kind !== "agent") {
    return [...entries];
  }
  return replaceAt(entries, at, { ...held, draft: "final" });
}

/**
 * The draft goes, and if it went for a reason the going is said out loud.
 * Leaving a discarded answer on screen would present it as the one the agent
 * settled on; removing it silently would be the other kind of lie, so a note
 * takes its place and names what happened to the words the shopper had already
 * started reading. That path is an escalation and keeps its note.
 */
function withdrawDraft(
  entries: readonly ChatEntry[],
  streamId: string,
  reason: string,
): ChatEntry[] {
  const at = draftAt(entries, streamId);
  const held = entries[at];
  if (at === -1 || held?.kind !== "agent") {
    return [...entries];
  }
  if (reason === "") {
    return supersede(entries, at, held);
  }
  const note: ChatEntry = {
    kind: "agent",
    text: `${WITHDRAWN_PREFIX}: ${reason}.`,
    system: true,
  };
  return replaceAt(entries, at, note);
}

/**
 * The finished draft a spoken beat should land in. It is usually the tail, but
 * a withdrawal note from a rung that was escalated past can sit after it — and
 * the judged text belongs in the bubble the shopper was reading, not under the
 * notice explaining that a different bubble went.
 */
function lastSettled(entries: readonly ChatEntry[]): number {
  for (let at = entries.length - 1; at >= 0; at -= 1) {
    const entry = entries[at];
    if (entry === undefined || entry.kind === "buyer") return -1;
    // "live" claims too: a question that lands before its draft settles is
    // the same sentence, and leaving the live copy rendered it twice.
    if (entry.kind === "agent" && entry.draft !== undefined && !entry.system)
      return at;
  }
  return -1;
}

/**
 * What the run stands behind, landed where the shopper was already reading.
 * A settled draft is the same turn's prose one step earlier, so the judged
 * text finishes that bubble instead of opening a second one under it.
 */
export function speak(
  entries: readonly ChatEntry[],
  text: string,
  system?: boolean,
): ChatEntry[] {
  const at = system === true ? -1 : lastSettled(entries);
  const held = entries[at];
  if (at === -1 || held?.kind !== "agent") {
    return [...entries, { kind: "agent", text, system }];
  }
  return replaceAt(entries, at, {
    kind: "agent",
    text,
    streamId: held.streamId,
  });
}

/**
 * The last settled draft taken off the screen without a bubble. An ask beat
 * claims the draft its question was streamed as, and a live question renders
 * at the composer — printing the claimed draft too was the same sentence
 * twice, one directly above the other.
 */
export function claimQuietly(entries: readonly ChatEntry[]): ChatEntry[] {
  const at = lastSettled(entries);
  return at === -1 ? [...entries] : entries.filter((_entry, i) => i !== at);
}

type DraftSignal = Extract<
  AssistantSignal,
  { kind: "delta" | "draft-settled" | "draft-withdrawn" }
>;

const DRAFT_KINDS: readonly string[] = [
  "delta",
  "draft-settled",
  "draft-withdrawn",
];

export function isDraftSignal(signal: AssistantSignal): signal is DraftSignal {
  return DRAFT_KINDS.includes(signal.kind);
}

export function applyDraft(
  entries: readonly ChatEntry[],
  signal: DraftSignal,
): ChatEntry[] {
  if (signal.kind === "delta") {
    return appendDelta(entries, signal.streamId, signal.text);
  }
  if (signal.kind === "draft-settled") {
    return settleDraft(entries, signal.streamId);
  }
  return withdrawDraft(entries, signal.streamId, signal.reason);
}

/** A new sentence from the shopper ends the previous turn, so no draft of it
 *  is still waiting to be spoken into. */
export function closeDrafts(entries: readonly ChatEntry[]): ChatEntry[] {
  return entries.map((entry) =>
    entry.kind === "agent" && entry.draft !== undefined
      ? { ...entry, draft: undefined }
      : entry,
  );
}
