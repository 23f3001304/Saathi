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
  OUTCOME_TEXT,
  sortLine,
} from "./beatLines.ts";

function pill(id: string, text: string): AssistantSignal {
  // `afterMs` is the script player's clock; a live beat has already happened.
  return { kind: "activity", activity: { id, text, afterMs: 0 } };
}

/** A conversational turn has no outcome to report: the reply *is* the outcome.
 *  An unmapped state is never spoken either — it would put a raw enum in the
 *  agent's mouth, which is how "answered answer" reached the screen. */
function outcomeSignals(
  beat: Extract<AgentBeat, { kind: "outcome" }>,
): AssistantSignal[] {
  if (beat.state === "answered")
    return [{ kind: "work-done" }, { kind: "run-idle" }];
  // The transaction is carried whatever the outcome reads as: a bill whose
  // link mint was refused still has an order to pay, so the card needs the id
  // even on the states that are not `link_issued`.
  const settled: AssistantSignal[] =
    beat.txnId === null ? [] : [{ kind: "settlement", txnId: beat.txnId }];
  const known = OUTCOME_TEXT[beat.state];
  if (known === undefined) {
    return [
      { kind: "work-done" },
      { kind: "run-idle" },
      ...settled,
      pill(`outcome-${beat.state}`, beat.state),
    ];
  }
  const txn = beat.txnId === null ? "" : ` (${beat.txnId})`;
  // A link_issued whose detail admits no link was minted must not open with
  // "your payment link is ready" — the sentence and its own detail disagreed
  // on camera. The bill is the truthful headline either way.
  const lead =
    beat.state === "link_issued" && beat.detail.includes("no link issued")
      ? "Your bill is ready to pay."
      : known;
  return [
    { kind: "work-done" },
    { kind: "run-idle" },
    ...settled,
    { kind: "say", text: `${lead}${txn} ${beat.detail}`.trim(), system: true },
  ];
}

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
      return [pill(`blocked-${index}`, `Refused — ${beat.human}`)];
    case "sort-key":
      // `label` is already the host's sentence; `sortKey` is the machine token
      // behind it. Printing both, in that order, avoids "Sorted by price_asc".
      return [pill(`sort-key-${index}`, sortLine(beat))];
    case "cart":
      // agent-host emits no `signing-required` for the cart gate — the cart
      // beat itself is the cue, and `GET /chat/state.awaiting` confirms it.
      return [
        pill(`cart-${index}`, cartLine(beat)),
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

export function signalsForBeat(
  beat: AgentBeat,
  index: number,
): AssistantSignal[] {
  return (
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
