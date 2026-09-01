import type { ReactNode } from "react";
import type { JSX } from "react";
import type { VoiceKit } from "./ports.ts";
import type { TurnEndDetector } from "./turnEnd.ts";
import { useComposerVoice } from "./useComposerVoice.ts";
import { VoiceBar } from "./VoiceBar.tsx";

export type ComposerVoiceProps = {
  blocked: boolean;
  /** Whatever is already typed; voice adds to it and never replaces it. */
  text: string;
  setText: (text: string) => void;
  onSend: (text: string) => void;
  onOpenField: () => void;
  /** Newest assistant line, for the opt-in read-aloud. */
  speakText?: string;
  /** Injected in tests; production builds the real speech adapters. */
  kit?: VoiceKit;
  /** Injected in tests; production asks the small model over the network. */
  turnEnd?: TurnEndDetector;
  voiceStage?: ReactNode;
};

/**
 * The whole voice concern as one element, so the dock's own file gains a
 * component and not a subsystem. Everything speech-related — the state
 * machine, the engines, the preferences — stays on this side of the line.
 */
export function ComposerVoice({
  blocked,
  text,
  setText,
  onSend,
  onOpenField,
  speakText,
  kit,
  turnEnd,
  voiceStage,
}: ComposerVoiceProps): JSX.Element {
  const voice = useComposerVoice({
    text,
    blocked,
    setText,
    onSend,
    onOpenField,
  });
  return (
    <VoiceBar
      disabled={blocked}
      kit={kit}
      turnEnd={turnEnd}
      voiceStage={voiceStage}
      speakText={speakText}
      onListen={voice.onListen}
      onInterim={voice.onInterim}
      onFinal={voice.onFinal}
      onSubmit={voice.onSubmit}
    />
  );
}
