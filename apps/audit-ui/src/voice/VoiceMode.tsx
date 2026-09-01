import { useEffect, useRef, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LanguageChoice } from "./detectedLanguage.ts";
import { faultSentence } from "./messages.ts";
import type { VoiceLanguage } from "./ports.ts";
import { useModalSurface } from "./useModalSurface.ts";
import type { VoiceSession } from "./useVoiceSession.ts";
import { orbStatus } from "./orbState.ts";
import { VoiceControls } from "./VoiceControls.tsx";
import { VoiceOrb } from "./VoiceOrb.tsx";
import { VoiceTranscript } from "./VoiceTranscript.tsx";
import styles from "./VoiceMode.module.css";

export type VoiceModeProps = {
  session: VoiceSession;
  language: LanguageChoice;
  detected: VoiceLanguage | null;
  /** The newest assistant line — what the surface is reading out. */
  reply?: string;
  /**
   * Whatever the conversation currently has on the table, rendered here rather
   * than described. Hands-free does not mean eyes-free: being told about three
   * shoes you cannot see is worse than being shown them. The voice layer never
   * learns what any of it *is* — the conversation passes the element in.
   */
  stage?: ReactNode;
  reducedMotion: boolean;
  onLanguageChange: (choice: LanguageChoice) => void;
  onClose: () => void;
};

/**
 * Voice mode: the whole viewport given over to one exchange.
 *
 * It is a second surface, never a second engine — the session it draws is the
 * same one the voice row uses, so entering here cannot leave a microphone or
 * a voice running underneath. Leaving stops both, which is the only way to
 * keep the promise that nothing speaks while this is not on screen.
 */
export function VoiceMode({
  session,
  language,
  detected,
  reply = "",
  stage,
  reducedMotion,
  onLanguageChange,
  onClose,
}: VoiceModeProps): JSX.Element {
  const surface = useRef<HTMLDivElement>(null);
  useModalSurface(surface, onClose);
  useEffect(() => session.enter(), [session.enter]);

  return createPortal(
    <div
      ref={surface}
      className={styles.surface}
      role="dialog"
      aria-modal="true"
      aria-label="Voice mode"
      tabIndex={-1}
    >
      <VoiceOrb
        phase={session.phase}
        levels={session.input.levels}
        reducedMotion={reducedMotion}
        onTap={session.tap}
      />
      <p className={styles.status} role="status" aria-live="polite">
        {session.muted ? "Microphone muted" : orbStatus(session.phase)}
      </p>
      <VoiceTranscript
        phase={session.phase}
        parts={{ interim: session.input.interim, heard: session.heard, reply }}
      />
      {stage !== undefined && <div className={styles.stage}>{stage}</div>}
      {session.input.fault !== null && (
        <p className={styles.fault}>{faultSentence(session.input.fault)}</p>
      )}
      <VoiceControls
        muted={session.muted}
        language={language}
        detected={detected}
        onMutedChange={session.setMuted}
        onLanguageChange={onLanguageChange}
        onClose={onClose}
      />
    </div>,
    document.body,
  );
}
