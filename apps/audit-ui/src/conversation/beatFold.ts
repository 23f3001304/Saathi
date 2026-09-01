// What a beat does to the screen, and whose beats they are. Split out of
// beatSession.ts, which is now only what the ladder carries between its rungs:
// the cursor, the timers and the session shape. The dependency runs one way —
// this file names the session, the session knows nothing about folding.
import type { AgentBeat } from "../api/agentBeat.ts";
import { applyAmendmentBeat } from "../covenant/amendmentBeat.ts";
import { signalsForBeat } from "./beatSignals.ts";
import type { StreamSession } from "./beatSession.ts";

/** Ignores what the screen already has, so a replay is never a repeat. The
 *  amendment beat lands here and not in `signalsForBeat`, which is a pure
 *  mapper: a proposal is a side effect on the covenant screen's pending set,
 *  not an entry in this conversation. `proposeAmendment` is keyed by id, so
 *  even a rebased replay cannot propose the same change twice. */
export function fold(
  session: StreamSession,
  beat: AgentBeat,
  index: number,
): void {
  if (beat.kind === "amendment") applyAmendmentBeat(beat);
  for (const signal of signalsForBeat(beat, index)) session.emit(signal);
}

/**
 * A beat nobody has claimed yet is held rather than folded or dropped: the
 * probe is one round trip and beats can arrive inside it, and the run whose
 * first beats those are is usually this chat's own.
 */
export function feed(
  session: StreamSession,
  beat: AgentBeat,
  index: number,
): void {
  if (index <= session.seen) return;
  session.seen = index;
  if (session.owns === "theirs") return;
  if (session.owns === "unknown") {
    session.held.push({ beat, index });
    return;
  }
  fold(session, beat, index);
}

/**
 * The host named the conversation the beats on the hub belong to. A named chat
 * adopts only beats stamped with its own name — an anonymous run is somebody
 * else's (the CLI's, another client's), and a chat with no id of its own is
 * the only one that may adopt those.
 */
export function claim(
  session: StreamSession,
  conversation: string | null,
): void {
  session.owns = conversation === session.chat ? "mine" : "theirs";
  const held = session.held;
  session.held = [];
  if (session.owns !== "mine") return;
  for (const row of held) fold(session, row.beat, row.index);
}

export function drain(
  session: StreamSession,
  beats: readonly AgentBeat[],
): void {
  for (let i = session.seen; i < beats.length; i += 1) {
    const beat = beats[i];
    if (beat !== undefined) feed(session, beat, i + 1);
  }
}
