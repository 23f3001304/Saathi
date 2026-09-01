import type { ChatBeat } from "./chat-beat.js";
import type { ChatLane, ChatLanes } from "./chat-lanes.js";

/** What a parked lane is waiting on a person for, or `null` for nothing. */
export type Attention = "question" | "pick" | "sign" | "handoff" | null;

export interface LaneReport {
  readonly conversation: string | null;
  readonly running: boolean;
  /** Place in the global line, or `null` when not waiting. */
  readonly queued: number | null;
  readonly attention: Attention;
}

/** The beat kinds that settle what a stopped run left on the table. */
const PARKED_KINDS = new Set(["question", "options", "outcome", "verdict"]);

/**
 * Derived from what the harness observed, never from what a model said: the
 * gates know they are held, the window knows it was handed over, and the hub
 * holds the run's own closing beat. A run that stopped on a `question` beat is
 * owed an answer; one whose last table beat is `options` is owed a pick; one
 * that reached `outcome` or `verdict` is owed nothing.
 */
function parkedOn(beats: readonly ChatBeat[]): Attention {
  for (let at = beats.length - 1; at >= 0; at -= 1) {
    const kind = beats[at]?.kind ?? "";
    if (!PARKED_KINDS.has(kind)) continue;
    if (kind === "question") return "question";
    return kind === "options" ? "pick" : null;
  }
  return null;
}

/** A sign gate holds mid-run and a handoff holds mid-errand, so neither is
 *  gated on the run having stopped; the parked reads are. */
export function attentionOf(lane: ChatLane): Attention {
  const state = lane.chat.state();
  if (state.awaiting.length > 0) return "sign";
  const view = lane.browser.view();
  if (view?.state === "user-drive" || (view?.handoff ?? null) !== null) {
    return "handoff";
  }
  if (lane.chat.busy) return null;
  return parkedOn(state.beats);
}

/**
 * The cheap list a client polls to badge chats that are not on screen. One
 * row per lane the host holds plus one per conversation still in line, so a
 * queued chat shows its place before it has a run at all.
 */
export function lanesReport(lanes: ChatLanes): readonly LaneReport[] {
  const held = lanes.all().map((lane) => ({
    conversation: lane.conversation,
    running: lane.chat.busy,
    queued: null,
    attention: attentionOf(lane),
  }));
  const waiting = lanes.queued().map((conversation, at) => ({
    conversation,
    running: false,
    queued: at + 1,
    attention: null,
  }));
  const shown = new Set(waiting.map((row) => row.conversation));
  return [...held.filter((row) => !shown.has(row.conversation)), ...waiting];
}
