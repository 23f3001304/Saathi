import { useCallback, useEffect, useRef, useState } from "react";
import { speakingLanguage, type LanguageChoice } from "./detectedLanguage.ts";
import type { SpeechSynthesizer, VoiceLanguage } from "./ports.ts";
import { readSpeakReplies, writeSpeakReplies } from "./voicePreference.ts";

export type SpokenRepliesOptions = {
  readonly synthesizer: SpeechSynthesizer;
  /** What the shopper picked, which is "detect" unless they said otherwise. */
  readonly language: LanguageChoice;
  /** What the recogniser reported hearing, when the engine could tell. */
  readonly heard?: VoiceLanguage | null;
  /** The newest assistant line, or undefined when there is nothing to read. */
  readonly text: string | undefined;
  /**
   * Speaks for as long as this is true without touching the stored
   * preference — the full-screen surface reads aloud by default, and leaving
   * it must not silently opt the user in everywhere else.
   */
  readonly force?: boolean;
  /** An utterance ended or failed. Being cancelled is not an ending. */
  readonly onSettled?: () => void;
};

export type SpokenReplies = {
  readonly enabled: boolean;
  readonly speaking: boolean;
  readonly available: boolean;
  readonly setEnabled: (enabled: boolean) => void;
  readonly cancel: () => void;
};

/**
 * Speaking back, opt-in and remembered.
 *
 * Two rules, both about not startling anyone. Nothing is ever read aloud on
 * first load: the line already on screen when this mounts is recorded as
 * "handled" before any speech can start. And switching the toggle on
 * re-baselines the same way, so enabling it means "read me what comes next",
 * not "read me the thing I have already finished reading".
 */
/** Stopping and toggling: split out so the hook body stays readable. */
function useControls(
  synthesizer: SpokenRepliesOptions["synthesizer"],
  setSpeaking: (value: boolean) => void,
  setStored: (value: boolean) => void,
): { cancel: () => void; setEnabled: (next: boolean) => void } {
  const cancel = useCallback((): void => {
    synthesizer.cancel();
    setSpeaking(false);
  }, [synthesizer, setSpeaking]);

  // Silence on unmount: a page you have left must not keep talking.
  useEffect(() => cancel, [cancel]);

  const setEnabled = useCallback(
    (next: boolean): void => {
      setStored(next);
      writeSpeakReplies(next);
      if (!next) cancel();
    },
    [cancel, setStored],
  );

  return { cancel, setEnabled };
}

/**
 * The reply's own script leads: the model may answer in Devanagari to
 * Latin-script Hinglish, and the voice has to follow the words about to be
 * heard rather than the ones that were said.
 */
function replyVoice(options: SpokenRepliesOptions): VoiceLanguage {
  const { text, heard = null, language } = options;
  return speakingLanguage(text ?? "", heard, language);
}

export function useSpokenReplies(options: SpokenRepliesOptions): SpokenReplies {
  const { synthesizer, text, force = false, onSettled } = options;
  const speaks = replyVoice(options);
  const [stored, setStored] = useState(readSpeakReplies);
  const [speaking, setSpeaking] = useState(false);
  const handled = useRef(text);
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });
  const enabled = stored || force;

  useEffect(() => {
    handled.current = text;
    // Declared before the speaking effect so this baseline wins on the very
    // commit where the toggle flips. Intentionally keyed on `enabled` only.
  }, [enabled]);

  useEffect(() => {
    if (!enabled || text === undefined || text === handled.current) return;
    handled.current = text;
    synthesizer.speak(text, speaks, (event) => {
      setSpeaking(event.kind === "speaking");
      if (event.kind !== "speaking") settled.current?.();
    });
  }, [enabled, text, speaks, synthesizer]);

  const { cancel, setEnabled } = useControls(
    synthesizer,
    setSpeaking,
    setStored,
  );

  const available = synthesizer.supports(speaks);
  return { enabled, speaking, available, setEnabled, cancel };
}
