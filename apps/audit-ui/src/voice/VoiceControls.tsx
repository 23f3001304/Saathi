import type { JSX } from "react";
import type { LanguageChoice } from "./detectedLanguage.ts";
import { LanguagePicker } from "./LanguagePicker.tsx";
import type { VoiceLanguage } from "./ports.ts";
import styles from "./VoiceMode.module.css";

type VoiceControlsProps = {
  muted: boolean;
  language: LanguageChoice;
  detected: VoiceLanguage | null;
  onMutedChange: (muted: boolean) => void;
  onLanguageChange: (choice: LanguageChoice) => void;
  onClose: () => void;
};

/**
 * The bottom row. Three real buttons with their names printed on them — a
 * hands-free surface is exactly where a bare icon is least recoverable,
 * because the person using it may not be looking at the screen at all.
 */
export function VoiceControls({
  muted,
  language,
  detected,
  onMutedChange,
  onLanguageChange,
  onClose,
}: VoiceControlsProps): JSX.Element {
  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={muted ? `${styles.control} ${styles.muted}` : styles.control}
        aria-pressed={muted}
        aria-label={muted ? "Unmute the microphone" : "Mute the microphone"}
        onClick={() => onMutedChange(!muted)}
      >
        {muted ? "Muted" : "Mute"}
      </button>
      <LanguagePicker
        value={language}
        detected={detected}
        disabled={false}
        onChange={onLanguageChange}
      />
      <button
        type="button"
        className={styles.control}
        aria-label="Close voice mode"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}
