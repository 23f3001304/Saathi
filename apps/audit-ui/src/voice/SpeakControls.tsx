import type { JSX } from "react";
import type { SpokenReplies } from "./useSpokenReplies.ts";
import styles from "./VoiceBar.module.css";

type SpeakControlsProps = {
  spoken: SpokenReplies;
};

/**
 * Reading replies aloud, off until asked for. The toggle is the whole
 * feature's consent, and the separate Stop button exists because "I want this
 * on in general" and "stop talking right now" are different wishes — making
 * someone switch the feature off to interrupt one sentence is why people turn
 * these things off for good.
 */
export function SpeakControls({
  spoken,
}: SpeakControlsProps): JSX.Element | null {
  if (!spoken.available) return null;
  return (
    <>
      {spoken.speaking && (
        <button
          type="button"
          className={styles.stop}
          aria-label="Stop speaking"
          onClick={spoken.cancel}
        >
          Stop
        </button>
      )}
      <button
        type="button"
        className={
          spoken.enabled ? `${styles.speak} ${styles.on}` : styles.speak
        }
        aria-pressed={spoken.enabled}
        aria-label="Read replies aloud"
        onClick={() => spoken.setEnabled(!spoken.enabled)}
      >
        <SpeakerGlyph muted={!spoken.enabled} />
        <span className={styles.speakText}>
          {spoken.enabled ? "Reading aloud" : "Read aloud"}
        </span>
      </button>
    </>
  );
}

function SpeakerGlyph({ muted }: { muted: boolean }): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M3 6.2h2.2L8 3.8v8.4L5.2 9.8H3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {muted ? (
        <path
          d="M10.6 6.2l3 3.6M13.6 6.2l-3 3.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M10.6 5.8a3.4 3.4 0 0 1 0 4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
