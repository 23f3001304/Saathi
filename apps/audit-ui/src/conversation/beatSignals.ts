// agent-host beats → the entry shapes Chat already renders. Pure and index-
// addressed, so a recorded beat list replays identically to a live socket.
//
// The rule: anything the host merely *did* becomes an activity pill, and only
// what the agent actually *said* becomes a bubble. An audit line dressed as
// speech would read as the agent's opinion.
import type { AgentBeat } from "../api/agentBeat.ts";
import { rupeesRounded } from "../primitives/formatMoney.ts";
import type { AssistantSignal } from "./assistantTransport.ts";
import {
  cartLine,
  DECISION_TEXT,
  memoryLine,
  pill,
  sortLine,
} from "./beatLines.ts";
import { outcomeSignals } from "./outcomeSignals.ts";

function signedSignals(
  beat: Extract<AgentBeat, { kind: "intent-signed" }>,
  index: number,
): AssistantSignal[] {
  return [
    { kind: "covenant", capPaise: beat.capPaise, thumbprint: beat.thumbprint },
    pill(
      `intent-signed-${index}`,
      `You signed · nothing above ${rupeesRounded(beat.capPaise)} · ${beat.thumbprint}`,
    ),
    { kind: "signed", scope: "intent" },
  ];
}

/** What the agent said, and the two gates it stops at. */
function conversationSignals(
  beat: AgentBeat,
  index: number,
): AssistantSignal[] | null {
  switch (beat.kind) {
    case "message":
      return [
        { kind: "say", text: beat.text, system: beat.variant === "system" },
      ];
    case "intent-draft":
      return [
        { kind: "say", text: `Here is what I would sign: ${beat.description}` },
      ];
    case "signing-required":
      return [{ kind: "await-sign", scope: "intent" }];
    case "intent-signed":
      return signedSignals(beat, index);
    case "options":
      return [
        { kind: "work-done" },
        { kind: "offer", options: [...beat.options] },
      ];
    // The ask is the turn's one utterance and the composer's whole state, so
    // it arrives as one signal that does both — see `applyAsk`.
    case "question":
      return [
        { kind: "work-done" },
        {
          kind: "ask",
          id: beat.questionId,
          prompt: beat.prompt,
          replies: [...beat.replies],
          groups: beat.groups ?? [],
        },
      ];
    default:
      return null;
  }
}

/**
 * A move the agent made at a window. Research runs with no window on screen,
 * so these pills are the whole of what the shopper watches happen — and they
 * are the harness's record of a move it saw made, never the agent's account.
 */
function stepSignals(beat: AgentBeat): AssistantSignal[] | null {
  return beat.kind === "step" ? [pill(beat.stepId, beat.label)] : null;
}

/** What the run did, as pills — the record, not the patter. */
function auditSignals(beat: AgentBeat, index: number): AssistantSignal[] {
  switch (beat.kind) {
    case "memory":
      return [pill(`memory-${index}`, memoryLine(beat))];
    case "blocked":
      return [pill(`blocked-${index}`, `Refused: ${beat.human}`)];
    case "sort-key":
      // `label` is already the host's sentence; `sortKey` is the machine token
      // behind it. Printing both, in that order, avoids "Sorted by price_asc".
      return [pill(`sort-key-${index}`, sortLine(beat))];
    case "cart":
      // agent-host emits no `signing-required` for the cart gate — the cart
      // beat itself is the cue, and `GET /chat/state.awaiting` confirms it.
      return [
        pill(`cart-${index}`, cartLine(beat)),
        // The bill binds to this, not to a tapped card's client-side price:
        // a scripted run once showed a Rs 1,299 sheet over a Rs 1,199 cart,
        // and what you see has to be what you sign.
        {
          kind: "cart-built",
          totalPaise: beat.totalPaise,
          itemCount: beat.itemCount,
        },
        { kind: "await-sign", scope: "cart" },
      ];
    case "verdict":
      return [
        pill(
          `verdict-${index}`,
          `${DECISION_TEXT[beat.decision] ?? beat.decision} · ${beat.passed} of ${beat.seals} checks passed`,
        ),
      ];
    default:
      return beat.kind === "outcome" ? outcomeSignals(beat) : [];
  }
}

/** The streamed half of a turn: a straight pass-through, because the host has
 *  already decided what a fragment belongs to and whether it was kept. */
function draftSignals(beat: AgentBeat): AssistantSignal[] | null {
  if (beat.kind === "delta")
    return [{ kind: "delta", streamId: beat.streamId, text: beat.text }];
  if (beat.kind === "draft-settled")
    return [{ kind: "draft-settled", streamId: beat.streamId }];
  if (beat.kind !== "draft-withdrawn") return null;
  const { streamId, reason } = beat;
  return [{ kind: "draft-withdrawn", streamId, reason }];
}

/**
 * The two kinds only the durable log ever produces. They are folded here, in
 * the one mapper, rather than beside the restore that reads them: a restored
 * beat and a live beat that took different code paths would drift, and only
 * one of the two would be under test.
 */
function restoredSignals(beat: AgentBeat): AssistantSignal[] | null {
  if (beat.kind === "buyer") return [{ kind: "buyer", text: beat.text }];
  if (beat.kind !== "sandbox") return null;
  return [{ kind: "sandbox", session: beat.session }];
}

/** Which card was chosen. It sets a field and prints nothing: the offer block
 *  already says which one is being fetched, and a pill saying it again would
 *  be the duplication the shopper has called out. */
function choiceSignals(beat: AgentBeat): AssistantSignal[] | null {
  return beat.kind === "picked" ? [{ kind: "picked", ref: beat.ref }] : null;
}

export function signalsForBeat(
  beat: AgentBeat,
  index: number,
): AssistantSignal[] {
  return (
    choiceSignals(beat) ??
    restoredSignals(beat) ??
    stepSignals(beat) ??
    draftSignals(beat) ??
    conversationSignals(beat, index) ??
    auditSignals(beat, index)
  );
}

export function signalsForBeats(
  beats: readonly AgentBeat[],
  firstIndex = 1,
): AssistantSignal[] {
  return beats.flatMap((beat, offset) =>
    signalsForBeat(beat, firstIndex + offset),
  );
}
