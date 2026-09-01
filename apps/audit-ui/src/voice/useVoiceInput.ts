import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { LanguageChoice } from "./detectedLanguage.ts";
import type {
  AmplitudeMeter,
  RecognizerEvent,
  SpeechRecognizer,
  VoiceLanguage,
} from "./ports.ts";
import { IDLE, reduceVoice, type VoiceState } from "./voiceMachine.ts";

type Sink = {
  readonly onInterim: (text: string) => void;
  readonly onFinal: (text: string) => void;
};

export type VoiceInputOptions = Sink & {
  readonly recognizer: SpeechRecognizer;
  readonly meter?: AmplitudeMeter | null;
  /** "detect" unless the shopper said otherwise; the engine is told either. */
  readonly language: LanguageChoice;
  /** prefers-reduced-motion: skip the live meter rather than fake a calm one. */
  readonly quiet?: boolean;
};

export type VoiceInput = VoiceState & {
  /** The language of the last transcript, as the engine reported it. */
  readonly heardLanguage: VoiceLanguage | null;
  readonly start: () => void;
  readonly stop: () => void;
  readonly toggle: () => void;
};

/**
 * Press-and-hold or toggle-to-talk, over any `SpeechRecognizer`. The hook
 * owns the state machine and nothing else: it never reads the DOM, never
 * names an engine, and never holds the composer's text — the transcript
 * leaves through `onInterim`/`onFinal` so typing stays the source of truth.
 */
export function useVoiceInput(options: VoiceInputOptions): VoiceInput {
  const { recognizer, meter = null, language, quiet = false } = options;
  const [state, dispatch] = useReducer(reduceVoice, IDLE);
  const [heardLanguage, setHeard] = useState<VoiceLanguage | null>(null);
  const pending = useRef("");
  const sink = useRef<Sink>(options);
  useEffect(() => {
    sink.current = options;
  });

  const stop = useCallback((): void => {
    recognizer.stop();
    meter?.stop();
  }, [recognizer, meter]);

  const start = useCallback((): void => {
    pending.current = "";
    dispatch({ type: "start" });
    recognizer.start(language, (event) => {
      if (event.kind === "final") setHeard(event.language);
      applyEvent(event, { sink: sink.current, pending, stop });
      dispatch({ type: "event", event });
    });
    if (!quiet) meter?.start((level) => dispatch({ type: "level", level }));
  }, [recognizer, meter, language, quiet, stop]);

  // Navigating away with the microphone open is how a voice UI earns a
  // permanent recording indicator in the browser chrome.
  useEffect(() => stop, [stop]);

  const phase = recognizer.supports(language) ? state.phase : "unsupported";

  const toggle = useCallback((): void => {
    if (phase === "listening") stop();
    else if (phase !== "unsupported" && phase !== "transcribing") start();
  }, [phase, start, stop]);

  return { ...state, phase, heardLanguage, start, stop, toggle };
}

type Effects = {
  readonly sink: Sink;
  readonly pending: { current: string };
  readonly stop: () => void;
};

function applyEvent(event: RecognizerEvent, fx: Effects): void {
  if (event.kind === "interim") {
    fx.pending.current = event.text;
    fx.sink.onInterim(event.text);
    return;
  }
  if (event.kind === "final") {
    fx.pending.current = "";
    fx.sink.onFinal(event.text);
    fx.stop();
    return;
  }
  if (event.kind === "stopped" || event.kind === "fault") flush(fx);
}

/**
 * A release can beat the engine's own end-of-utterance. Whatever was heard is
 * already on screen in the composer, so dropping it silently would read as
 * the app eating the user's sentence; it gets committed instead.
 */
function flush(fx: Effects): void {
  const text = fx.pending.current.trim();
  fx.pending.current = "";
  if (text !== "") fx.sink.onFinal(text);
}
