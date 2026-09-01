import type {
  SpeechSynthesizer,
  SynthesizerListener,
  VoiceLanguage,
} from "./ports.ts";

/**
 * The narrow slice of `window.speechSynthesis` this adapter uses, so a test
 * can hand it a plain object instead of faking a whole browser subsystem.
 */
export interface SpeechEnginePort {
  speak(
    text: string,
    language: VoiceLanguage,
    onDone: () => void,
    onFail: () => void,
  ): void;
  cancel(): void;
  /** Language tags the installed voices cover, lowercased. */
  languages(): readonly string[];
}

/** Null when the platform has no synthesiser at all (older WebViews, jsdom). */
export function browserSpeechEngine(): SpeechEnginePort | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  const synth = window.speechSynthesis;
  return {
    speak(text, language, onDone, onFail) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      const voice = synth.getVoices().find((v) => v.lang === language);
      if (voice !== undefined) utterance.voice = voice;
      utterance.onend = (): void => onDone();
      utterance.onerror = (): void => onFail();
      synth.speak(utterance);
    },
    cancel: () => synth.cancel(),
    // Empty until the async `voiceschanged` fires; `supports` treats an empty
    // list as "unknown, let it try" rather than as "nothing is speakable".
    languages: () => synth.getVoices().map((v) => v.lang.toLowerCase()),
  };
}

/**
 * Speaking back, in the browser's own voice. Deliberately dumb: it holds no
 * opt-in state of its own, because whether the assistant *should* speak is a
 * product decision that belongs to the hook and the toggle, not to an engine.
 */
export class WebSpeechSynthesizer implements SpeechSynthesizer {
  readonly id = "web-speech";

  constructor(
    private readonly engine: SpeechEnginePort | null = browserSpeechEngine(),
  ) {}

  supports(language: VoiceLanguage): boolean {
    const engine = this.engine;
    if (engine === null) return false;
    const installed = engine.languages();
    if (installed.length === 0) return true;
    const tag = language.toLowerCase();
    const root = tag.split("-")[0];
    return installed.some((v) => v === tag || v.startsWith(`${root}-`));
  }

  speak(
    text: string,
    language: VoiceLanguage,
    listen: SynthesizerListener,
  ): void {
    const engine = this.engine;
    if (engine === null) {
      listen({ kind: "fault", fault: "unsupported" });
      return;
    }
    this.cancel();
    listen({ kind: "speaking" });
    try {
      engine.speak(
        text,
        language,
        () => listen({ kind: "done" }),
        () => listen({ kind: "fault", fault: "failed" }),
      );
    } catch {
      listen({ kind: "fault", fault: "failed" });
    }
  }

  cancel(): void {
    try {
      this.engine?.cancel();
    } catch {
      // Cancelling an idle queue is a no-op everywhere that implements it.
    }
  }
}
