import type { JSX } from "react";
import type { LanguageChoice } from "./detectedLanguage.ts";
import { LanguagePicker } from "./LanguagePicker.tsx";
import { ListeningThread } from "./ListeningThread.tsx";
import { faultSentence } from "./messages.ts";
import { MicButton } from "./MicButton.tsx";
import type { VoiceFault, VoiceLanguage } from "./ports.ts";
import { SpeakControls } from "./SpeakControls.tsx";
import type { VoiceSession } from "./useVoiceSession.ts";
import type { VoicePhase } from "./voiceMachine.ts";
import styles from "./VoiceBar.module.css";

type VoiceRowProps = {
  session: VoiceSession;
  disabled: boolean;
  /** Voice mode is over the top of this row and is doing the announcing. */
  covered: boolean;
  language: LanguageChoice;
  /** What the engine heard, so the picker can show what "Detect" decided. */
  detected: VoiceLanguage | null;
  onLanguageChange: (choice: LanguageChoice) => void;
  onOpenMode: () => void;
};

function hintOf(phase: VoicePhase, fault: VoiceFault | null): string {
  if (phase === "unsupported") return faultSentence("unsupported");
  if (phase === "listening") return "Listening…";
  if (phase === "transcribing") return "Working out what you said…";
  return fault === null ? "" : faultSentence(fault);
}

/**
 * The voice row of the dock: talk, choose a language, be talked back to, or
 * hand the whole screen over to voice mode. Every control here is a real
 * button or select with a label, the transcript lands in the composer as
 * ordinary editable text, and switching all of this off changes nothing about
 * typing — voice is the second way in, not the new one.
 */
export function VoiceRow({
  session,
  disabled,
  covered,
  language,
  detected,
  onLanguageChange,
  onOpenMode,
}: VoiceRowProps): JSX.Element {
  const { input } = session;
  const live = input.phase === "listening" || input.phase === "transcribing";
  return (
    <div className={styles.bar}>
      <MicButton
        phase={input.phase}
        disabled={disabled || input.phase === "unsupported"}
        onStart={session.begin}
        onStop={input.stop}
        onToggle={session.toggle}
      />
      {live && (
        <ListeningThread
          levels={input.levels}
          settling={input.phase === "transcribing"}
        />
      )}
      {/* State, not words. The transcript is announced by the composer field
          it lands in; repeating every partial here would make a screen reader
          talk over the person who is still mid-sentence. Under voice mode the
          row gives up its live region entirely, so the same state is not
          announced twice by two surfaces. */}
      {covered ? (
        <p className={styles.hint} />
      ) : (
        <p className={styles.hint} role="status" aria-live="polite">
          {hintOf(input.phase, input.fault)}
        </p>
      )}
      <div className={styles.tail}>
        {/* An engine that cannot listen has no full-screen surface to offer. */}
        {input.phase !== "unsupported" && (
          <button
            type="button"
            className={styles.speak}
            disabled={disabled}
            aria-label="Open voice mode"
            onClick={onOpenMode}
          >
            <BloomGlyph />
            <span className={styles.speakText}>Voice mode</span>
          </button>
        )}
        <LanguagePicker
          value={language}
          detected={detected}
          disabled={disabled}
          onChange={onLanguageChange}
        />
        <SpeakControls spoken={session.spoken} />
      </div>
    </div>
  );
}

function BloomGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M8 2.4c2 1.6 2 3.6 0 5.6-2-2-2-4 0-5.6ZM8 13.6c-2-1.6-2-3.6 0-5.6 2 2 2 4 0 5.6ZM2.4 8c1.6-2 3.6-2 5.6 0-2 2-4 2-5.6 0ZM13.6 8c-1.6 2-3.6 2-5.6 0 2-2 4-2 5.6 0Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
