import { useEffect, useMemo, useRef } from "react";

export type ComposerVoiceOptions = {
  /** Whatever is already typed. Voice adds to it; it never clears it. */
  readonly text: string;
  readonly blocked: boolean;
  readonly setText: (text: string) => void;
  readonly onSend: (text: string) => void;
  /** Reveals the text field, so the words are visible while they arrive. */
  readonly onOpenField: () => void;
};

export type ComposerVoice = {
  readonly onListen: () => void;
  readonly onInterim: (heard: string) => void;
  /** Dictation into the composer. The words stay put; the user sends them. */
  readonly onFinal: (heard: string) => void;
  /** A completed hands-free turn, which is a sentence the user has finished. */
  readonly onSubmit: (heard: string) => void;
};

/**
 * The join between a transcript and the composer.
 *
 * Two rules make voice an addition rather than a takeover. Anything already
 * typed is kept as a prefix, so half-typing a sentence and finishing it out
 * loud works. And every partial is written into the field as ordinary text,
 * which means the user watches the machine's understanding form and can
 * correct it with the keyboard at any point — the transcript is never a
 * hidden buffer.
 *
 * DECISION: dictating does not send. A transcript is a guess, and the composer
 * is where a guess gets checked — pressing the microphone must never be the
 * act that commits a purchase request. Voice mode is the exception, and only
 * because it is hands-free: there is no keyboard to correct with and no send
 * button on screen, so the completed utterance is the user's intent.
 */
export function useComposerVoice(options: ComposerVoiceOptions): ComposerVoice {
  const base = useRef("");
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  // Stable across renders: this object is handed to the recogniser, and a new
  // identity every keystroke would tear down the listener mid-sentence.
  return useMemo(
    () => ({
      onListen: (): void => {
        base.current = latest.current.text.trim();
        latest.current.onOpenField();
      },
      onInterim: (heard: string): void => {
        latest.current.setText(join(base.current, heard));
      },
      onFinal: (heard: string): void => {
        const full = join(base.current, heard);
        // Kept as the base so a second dictation appends rather than replaces,
        // even if the field is re-entered without another `onListen`.
        base.current = full;
        latest.current.setText(full);
      },
      onSubmit: (heard: string): void => {
        const { blocked, setText, onSend } = latest.current;
        const full = join(base.current, heard);
        base.current = "";
        setText("");
        if (full !== "" && !blocked) onSend(full);
      },
    }),
    [],
  );
}

function join(base: string, heard: string): string {
  const spoken = heard.trim();
  if (base === "") return spoken;
  if (spoken === "") return base;
  return `${base} ${spoken}`;
}
