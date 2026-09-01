import { useEffect, useRef, type JSX, type MouseEvent } from "react";
import type { VoicePhase } from "./voiceMachine.ts";
import styles from "./MicButton.module.css";

/** Past this, a press reads as "hold to talk"; under it, as "tap to latch". */
const HOLD_MS = 450;

type MicButtonProps = {
  phase: VoicePhase;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
  onToggle: () => void;
};

const LABELS: Readonly<Record<VoicePhase, string>> = {
  idle: "Speak instead of typing",
  listening: "Listening: press to stop",
  transcribing: "Working out what you said",
  blocked: "Voice unavailable: press for details",
  unsupported: "Voice input is not available in this browser",
};

/**
 * Hold to talk, or tap to latch — both, because neither alone fits every
 * hand: holding suits a quick aside, latching suits a long sentence.
 *
 * The keyboard is not an afterthought here. Enter and Space produce a click
 * with `detail === 0` and no pointer events at all, so that case routes to a
 * plain toggle and the whole control works without a pointing device.
 */
export function MicButton({
  phase,
  disabled,
  onStart,
  onStop,
  onToggle,
}: MicButtonProps): JSX.Element {
  const mode = useRef<"off" | "hold" | "latched">("off");
  const pressedAt = useRef(0);
  const listening = phase === "listening";

  // The engine can end a turn on its own; the button's idea of being latched
  // has to follow the machine rather than the other way round.
  useEffect(() => {
    if (phase !== "listening") mode.current = "off";
  }, [phase]);

  function handleDown(): void {
    // A batch engine is still uploading the last utterance; starting another
    // would land two transcripts in the composer out of order. The control
    // stays focusable and keeps announcing what it is doing.
    if (disabled || phase === "transcribing") return;
    if (mode.current === "latched") {
      mode.current = "off";
      onStop();
      return;
    }
    mode.current = "hold";
    pressedAt.current = Date.now();
    onStart();
  }

  function handleUp(): void {
    if (mode.current !== "hold") return;
    if (Date.now() - pressedAt.current >= HOLD_MS) {
      mode.current = "off";
      onStop();
      return;
    }
    mode.current = "latched";
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    if (event.detail === 0 && !disabled) onToggle();
  }

  return (
    <button
      type="button"
      className={`${styles.mic} ${styles[phase] ?? ""}`.trim()}
      disabled={disabled}
      aria-label={LABELS[phase]}
      aria-pressed={listening}
      aria-disabled={phase === "transcribing"}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onPointerLeave={handleUp}
      onClick={handleClick}
    >
      <MicGlyph />
    </button>
  );
}

function MicGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect
        x="6"
        y="2"
        width="4"
        height="7"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M3.8 7.4a4.2 4.2 0 0 0 8.4 0M8 11.6V14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
