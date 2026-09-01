import { useState, type FormEvent, type JSX } from "react";
import styles from "./Composer.module.css";

// The shopper's dock, in the shopper's stylesheet. What is gone is what the
// shopkeeper has no use for: no attachments, no voice, no hold-to-buy — this
// app moves no money, so the dock carries nothing that could.

type ComposerProps = {
  blocked: boolean;
  onSend: (text: string) => void;
};

export function Composer({ blocked, onSend }: ComposerProps): JSX.Element {
  const [text, setText] = useState("");

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (text.trim() === "" || blocked) return;
    onSend(text.trim());
    setText("");
  }

  return (
    <div className={styles.dock}>
      <form className={styles.row} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <input
            className={styles.input}
            value={text}
            disabled={blocked}
            placeholder={
              blocked ? "Reading your shop…" : "Ask about your shop…"
            }
            onChange={(event) => setText(event.target.value)}
          />
          <button
            type="submit"
            className={styles.send}
            disabled={blocked || text.trim() === ""}
            aria-label="Send"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
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
      </form>
    </div>
  );
}
