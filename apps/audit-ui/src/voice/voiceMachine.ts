import { isBenign } from "./messages.ts";
import type { RecognizerEvent, VoiceFault } from "./ports.ts";

/** How many amplitude samples the kolam thread draws at once. */
export const BAR_COUNT = 7;

export type VoicePhase =
  "unsupported" | "idle" | "listening" | "transcribing" | "blocked";

export type VoiceState = {
  readonly phase: VoicePhase;
  /** What has been heard but not yet committed; the dock renders it as text. */
  readonly interim: string;
  /** Rolling window of real input loudness, oldest first, each 0..1. */
  readonly levels: readonly number[];
  readonly fault: VoiceFault | null;
};

const FLAT: readonly number[] = new Array<number>(BAR_COUNT).fill(0);

export const IDLE: VoiceState = {
  phase: "idle",
  interim: "",
  levels: FLAT,
  fault: null,
};

export type VoiceAction =
  | { readonly type: "start" }
  | { readonly type: "level"; readonly level: number }
  | { readonly type: "event"; readonly event: RecognizerEvent };

export function reduceVoice(
  state: VoiceState,
  action: VoiceAction,
): VoiceState {
  if (action.type === "start") return { ...IDLE, phase: "listening" };
  if (action.type === "level") {
    if (state.phase !== "listening") return state;
    return { ...state, levels: shift(state.levels, action.level) };
  }
  return reduceEvent(state, action.event);
}

function reduceEvent(state: VoiceState, event: RecognizerEvent): VoiceState {
  switch (event.kind) {
    case "listening":
      return { ...state, phase: "listening", fault: null };
    case "interim":
      return { ...state, interim: event.text };
    case "transcribing":
      return { ...state, phase: "transcribing", levels: FLAT };
    case "final":
      return IDLE;
    case "stopped":
      // An engine that reports a fault and *then* ends must not have its bad
      // news overwritten by the tidy ending that follows it.
      return state.fault === null ? IDLE : state;
    case "fault":
      return { ...IDLE, phase: phaseOfFault(event.fault), fault: event.fault };
  }
}

function phaseOfFault(fault: VoiceFault): VoicePhase {
  if (fault === "unsupported") return "unsupported";
  // "Didn't catch that" is not a broken microphone; it is a nudge to press
  // again, so it leaves the control usable rather than locking it out.
  return isBenign(fault) ? "idle" : "blocked";
}

function shift(levels: readonly number[], level: number): readonly number[] {
  return [...levels.slice(1), level];
}
