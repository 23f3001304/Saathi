// The fold: signals in, chat entries out. Pure, so the same reduction runs in
// a test over recorded agent-host beats with no React tree.
import { applyDraft, isDraftSignal } from "./draftEntries.ts";
import type { AssistantSignal } from "./assistantTransport.ts";
import { applyEntrySignal, closeWork } from "./entrySignals.ts";
import type { EntrySignal } from "./entrySignals.ts";
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
