import {
  useRef,
  useState,
  type FormEvent,
  type JSX,
  type ReactNode,
} from "react";
import { useStageMorph } from "../motion/useStageMorph.ts";
import { ComposerVoice } from "../voice/ComposerVoice.tsx";
import type { VoiceKit } from "../voice/ports.ts";
import type { TurnEndDetector } from "../voice/turnEnd.ts";
import styles from "./Composer.module.css";

export type ComposerAction = { label: string; onClick: () => void };

type ComposerProps = {
  blocked: boolean;
  onSend: (text: string) => void;
  /** Newest assistant line, for the opt-in read-aloud. */
  speakText?: string;
  /** Injected in tests; production builds the real speech adapters. */
  voiceKit?: VoiceKit;
  turnEnd?: TurnEndDetector;
  /** Rendered inside voice mode: what is on the table, shown not described. */
  voiceStage?: ReactNode;
  /** Contextual replies for whatever the agent just put on the table. */
  actions?: ComposerAction[];
  /** The one thing to do right now. Replaces send while it is present. */
  primary?: ReactNode;
  /** What the dock is currently asking for, in one short sentence. */
  prompt?: string;
  /** What the empty field is for right now. A question with no chips is still
   *  the composer transformed: the box says what it is waiting to be told. */
  placeholder?: string;
  /** The choice itself, when the dock is a picker rather than a text field. */
  picker?: ReactNode;
  /** What the escape hatch back to the text field says. "Ask something else"
   *  is wrong under a question the shopper is being asked to answer. */
  openLabel?: string;
  /** Names the current step so the dock can morph between them. */
  stage?: string;
};

/**
 * The dock, not a chat box. It carries whatever the conversation currently
 * asks of the buyer: quick replies for the options on screen, and — when a
 * cart is waiting — the commitment itself, pinned where the hand already is
 * rather than stranded halfway up the transcript.
 *
 * §8/§2.1 — blocked: gateway down disables the dock, fail-closed.
 */
export function Composer({
  blocked,
  onSend,
  actions,
  primary,
  prompt,
  placeholder,
  picker,
  openLabel,
  stage = "idle",
  speakText,
  voiceKit,
  turnEnd,
  voiceStage,
}: ComposerProps): JSX.Element {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const askRef = useRef<HTMLDivElement>(null);
  useStageMorph(askRef, stage);

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (text.trim() === "" || blocked) return;
    onSend(text.trim());
    setText("");
  }

  return (
    <div className={styles.dock}>
      <div ref={askRef} className={styles.ask}>
        {prompt !== undefined && <p className={styles.prompt}>{prompt}</p>}
        {picker}
      </div>
      {actions !== undefined && actions.length > 0 && (
        <div className={styles.chips}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={styles.chip}
              disabled={blocked}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      <form className={styles.row} onSubmit={handleSubmit}>
        {(picker !== undefined ||
          (actions !== undefined && actions.length > 0) ||
          primary !== undefined) &&
        !typing ? (
          <button
            type="button"
            className={styles.askInstead}
            onClick={() => setTyping(true)}
          >
            {openLabel ?? "Ask something else"}
          </button>
        ) : (
          <div className={styles.field}>
            <input
              className={styles.input}
              value={text}
              disabled={blocked}
              placeholder={
                blocked
                  ? "Nothing is answering: nothing can be bought"
                  : (placeholder ?? "Ask Saathi…")
              }
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="submit"
              className={styles.send}
              disabled={blocked || text.trim() === ""}
              aria-label="Send"
            >
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  d="M2 8h10M8.5 4l4 4-4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
        {primary}
      </form>
      <ComposerVoice
        blocked={blocked}
        text={text}
        setText={setText}
        onSend={onSend}
        onOpenField={() => setTyping(true)}
        speakText={speakText}
        kit={voiceKit}
        turnEnd={turnEnd}
        voiceStage={voiceStage}
      />
    </div>
  );
}
