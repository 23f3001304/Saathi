import { useCallback, useState } from "react";
import type { LanguageChoice } from "./detectedLanguage.ts";
import type { VoiceKit } from "./ports.ts";
import { useSpokenReplies, type SpokenReplies } from "./useSpokenReplies.ts";
import { useVoiceInput, type VoiceInput } from "./useVoiceInput.ts";
import { orbPhase, type OrbPhase } from "./orbState.ts";
import type { TurnEndDetector } from "./turnEnd.ts";
import { useLatest } from "./useLatest.ts";
import { heardInterim, useDetector, useTurnBuffer } from "./useTurnBuffer.ts";

export type VoiceSessionOptions = {
  readonly kit: VoiceKit;
  /** "detect" by default; an explicit choice is passed straight through. */
  readonly language: LanguageChoice;
  /** prefers-reduced-motion: the live meter is never started. */
  readonly quiet: boolean;
  /** True while the full-screen surface is up: read aloud, then listen again. */
  readonly hands: boolean;
  readonly speakText: string | undefined;
  readonly onInterim: (text: string) => void;
  readonly onFinal: (text: string) => void;
  /** Runs before every start, however the turn began. */
  readonly onStart?: () => void;
  /** Injected in tests; production asks the small model over the network. */
  readonly turnEnd?: TurnEndDetector;
};

export type VoiceSession = {
  readonly input: VoiceInput;
  readonly spoken: SpokenReplies;
  readonly phase: OrbPhase;
  /** The last thing the user actually said, kept so the surface can show it. */
  readonly heard: string;
  readonly muted: boolean;
  readonly begin: () => void;
  readonly toggle: () => void;
  /** The orb: barge in while it is speaking, otherwise start or stop a turn. */
  readonly tap: () => void;
  readonly setMuted: (muted: boolean) => void;
  /** Opens a hands-free turn and returns the teardown that closes it. */
  readonly enter: () => () => void;
};

type Latest = VoiceSessionOptions & { readonly muted: boolean };

/**
 * One turn-taking loop over the two speech ports, shared by the voice row and
 * the full-screen surface — so entering voice mode never starts a second
 * recogniser, and never leaves a second voice talking behind the first.
 */
export function useVoiceSession(options: VoiceSessionOptions): VoiceSession {
  const [muted, setMuted] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const latest = useLatest<Latest>({ ...options, muted });
  const { input, heard } = useHeard(options, latest, () => setAwaiting(true));

  const begin = useCallback((): void => {
    setAwaiting(false);
    latest.current.onStart?.();
    input.start();
  }, [input.start, latest]);

  const spoken = useSpokenReplies({
    synthesizer: options.kit.synthesizer,
    language: options.language,
    heard: input.heardLanguage,
    text: options.speakText,
    force: options.hands,
    // The whole point of the surface: a finished reply hands the turn back.
    onSettled: useCallback((): void => {
      setAwaiting(false);
      if (latest.current.hands && !latest.current.muted) begin();
    }, [begin, latest]),
  });

  const phase = phaseOf(input, spoken, awaiting);
  const controls = useControls({
    input,
    spoken,
    phase,
    begin,
    setMuted,
    latest,
  });
  return { input, spoken, phase, heard, muted, begin, ...controls };
}

function phaseOf(
  input: VoiceInput,
  spoken: SpokenReplies,
  awaiting: boolean,
): OrbPhase {
  return orbPhase({
    listening: input.phase === "listening",
    transcribing: input.phase === "transcribing",
    awaiting,
    speaking: spoken.speaking,
  });
}

/** Listening, plus a memory of the last committed line for the surface. */
function useHeard(
  options: VoiceSessionOptions,
  latest: { current: Latest },
  onSent: () => void,
): { input: VoiceInput; heard: string } {
  const [heard, setHeard] = useState("");
  // Only the hands-free surface buffers. In the row the shopper presses send,
  // so holding their words back to think about it would be pure latency.
  const detector = useDetector(options.turnEnd);
  const turn = useTurnBuffer(detector, (text: string): void => {
    onSent();
    latest.current.onFinal(text);
  });
  const input = useVoiceInput({
    recognizer: options.kit.recognizer,
    meter: options.kit.meter,
    language: options.language,
    quiet: options.quiet,
    onInterim: heardInterim(latest, turn),
    onFinal: (text: string): void => {
      setHeard(text);
      if (!latest.current.hands) {
        latest.current.onFinal(text);
        return;
      }
      turn.push(text);
    },
  });
  return { input, heard };
}

type ControlParts = {
  readonly input: VoiceInput;
  readonly spoken: SpokenReplies;
  readonly phase: OrbPhase;
  readonly begin: () => void;
  readonly setMuted: (muted: boolean) => void;
  readonly latest: { current: Latest };
};

type Controls = Pick<VoiceSession, "toggle" | "tap" | "setMuted" | "enter">;

function turn(input: VoiceInput, begin: () => void): void {
  if (input.phase === "listening") {
    input.stop();
    return;
  }
  // Starting a second turn while a batch engine is still uploading the first
  // would land two transcripts in the conversation out of order.
  const busy = input.phase === "transcribing" || input.phase === "unsupported";
  if (!busy) begin();
}

function useControls(parts: ControlParts): Controls {
  const { input, spoken, phase, begin, latest } = parts;

  const toggle = useCallback(
    (): void => turn(input, begin),
    [input.phase, input.stop, begin],
  );

  // Exactly what `orbLabel` promises for each phase, so the orb never claims
  // to be inert and then acts, or offers a press that does nothing.
  const tap = useCallback((): void => {
    if (phase === "thinking") return;
    if (phase !== "speaking") {
      toggle();
      return;
    }
    spoken.cancel();
    begin();
  }, [phase, spoken.cancel, toggle, begin]);

  const setMuted = useCallback(
    (next: boolean): void => {
      parts.setMuted(next);
      if (next) input.stop();
      else begin();
    },
    [parts.setMuted, input.stop, begin],
  );

  const enter = useCallback((): (() => void) => {
    if (!latest.current.muted) begin();
    // Nothing may be heard or said once the surface is gone.
    return (): void => {
      spoken.cancel();
      input.stop();
    };
  }, [begin, spoken.cancel, input.stop, latest]);

  return { toggle, tap, setMuted, enter };
}
