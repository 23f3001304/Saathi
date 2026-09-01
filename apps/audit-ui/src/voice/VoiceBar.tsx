import { useMemo, useState, type JSX, type ReactNode } from "react";
import { useReducedMotion } from "../motion/useReducedMotion.ts";
import { createVoiceKit } from "./createVoice.ts";
import type { LanguageChoice } from "./detectedLanguage.ts";
import type { VoiceKit } from "./ports.ts";
import type { TurnEndDetector } from "./turnEnd.ts";
import { useVoiceSession } from "./useVoiceSession.ts";
import { VoiceMode } from "./VoiceMode.tsx";
import { readLanguage, writeLanguage } from "./voicePreference.ts";
import { VoiceRow } from "./VoiceRow.tsx";

export type VoiceBarProps = {
  /** The dock is fail-closed; voice closes with it. */
  disabled: boolean;
  onInterim: (text: string) => void;
  /** A dictated line. It lands in the composer; it is not sent. */
  onFinal: (text: string) => void;
  /** A hands-free turn from voice mode, which does send. */
  onSubmit?: (text: string) => void;
  /** Newest assistant line. Read aloud only if the user has opted in. */
  speakText?: string;
  /** Lets a collapsed dock open its text field before the words arrive. */
  onListen?: () => void;
  /** Injected in tests; production builds the real adapters. */
  kit?: VoiceKit;
  /** Injected in tests; production asks the small model over the network. */
  turnEnd?: TurnEndDetector;
  /** What the conversation has on the table, shown on the hands-free surface. */
  voiceStage?: ReactNode;
};

/**
 * Voice, in two surfaces over one session.
 *
 * The row sits beside the text field and stays exactly what it was. Voice
 * mode is the same session given the whole screen — which is why this
 * component, not either surface, owns the engines: there is one recogniser
 * and one voice for the page however the user is talking to it.
 */
export function VoiceBar({
  disabled,
  onInterim,
  onFinal,
  onSubmit,
  speakText,
  onListen,
  kit,
  turnEnd,
  voiceStage,
}: VoiceBarProps): JSX.Element {
  const voiceKit = useMemo(() => kit ?? createVoiceKit(), [kit]);
  const [language, setLanguage] = useState<LanguageChoice>(readLanguage);
  const [open, setOpen] = useState(false);
  const quiet = useReducedMotion();
  // This component knows which surface produced the transcript, and that is
  // the only thing that decides whether it sends.
  const settle = (text: string): void => {
    if (open && onSubmit !== undefined) onSubmit(text);
    else onFinal(text);
  };
  const session = useVoiceSession({
    kit: voiceKit,
    language,
    quiet,
    hands: open,
    speakText,
    onInterim,
    onFinal: settle,
    onStart: onListen,
    turnEnd,
  });

  function changeLanguage(next: LanguageChoice): void {
    session.input.stop();
    session.spoken.cancel();
    setLanguage(next);
    writeLanguage(next);
  }

  // §8 fail-closed, and no surface for an engine that cannot listen.
  function openMode(): void {
    if (disabled || session.input.phase === "unsupported") return;
    setOpen(true);
  }

  // The row stays mounted underneath so the control that opened voice mode is
  // still there to take focus back when it closes.
  return (
    <>
      <VoiceRow
        session={session}
        disabled={disabled}
        covered={open}
        language={language}
        detected={session.input.heardLanguage}
        onLanguageChange={changeLanguage}
        onOpenMode={openMode}
      />
      {open && (
        <VoiceMode
          session={session}
          language={language}
          detected={session.input.heardLanguage}
          reply={speakText}
          stage={voiceStage}
          reducedMotion={quiet}
          onLanguageChange={changeLanguage}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
