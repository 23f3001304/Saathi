import type { LanguageChoice } from "./detectedLanguage.ts";
import type {
  RecognizerListener,
  SpeechRecognizer,
  SpeechSynthesizer,
  SynthesizerListener,
  VoiceLanguage,
} from "./ports.ts";

/**
 * Which engine to use is a property of the language, not of the caller, so
 * routing lives behind the port rather than in the dock.
 *
 * The rule was "Indic to Sarvam, English to the browser", on the reasoning
 * that browser engines carry English perfectly well. They carry it; they do
 * not carry it *like this product*. Switching to English dropped the voice to
 * the operating system's default and it was immediately audible — the same
 * assistant with a different mouth, halfway through a conversation.
 *
 * So the configured engine takes every language it supports, and the browser
 * is the floor beneath it: a build with no key, or a language Sarvam does not
 * carry, still speaks.
 */
function route<T extends { supports(language: LanguageChoice): boolean }>(
  browser: T,
  configured: T | null,
  language: LanguageChoice,
): T {
  if (configured !== null && configured.supports(language)) return configured;
  return browser;
}

export class RoutedRecognizer implements SpeechRecognizer {
  readonly id = "routed";

  private active: SpeechRecognizer | null = null;

  constructor(
    private readonly browser: SpeechRecognizer,
    private readonly configured: SpeechRecognizer | null,
  ) {}

  supports(language: LanguageChoice): boolean {
    return this.pick(language).supports(language);
  }

  start(language: LanguageChoice, listen: RecognizerListener): void {
    this.stop();
    const engine = this.pick(language);
    this.active = engine;
    engine.start(language, listen);
  }

  stop(): void {
    this.active?.stop();
  }

  private pick(language: LanguageChoice): SpeechRecognizer {
    return route(this.browser, this.configured, language);
  }
}

export class RoutedSynthesizer implements SpeechSynthesizer {
  readonly id = "routed";

  private active: SpeechSynthesizer | null = null;

  constructor(
    private readonly browser: SpeechSynthesizer,
    private readonly configured: SpeechSynthesizer | null,
  ) {}

  supports(language: VoiceLanguage): boolean {
    return this.pick(language).supports(language);
  }

  speak(
    text: string,
    language: VoiceLanguage,
    listen: SynthesizerListener,
  ): void {
    this.cancel();
    const engine = this.pick(language);
    this.active = engine;
    engine.speak(text, language, listen);
  }

  cancel(): void {
    this.active?.cancel();
  }

  private pick(language: VoiceLanguage): SpeechSynthesizer {
    return route(this.browser, this.configured, language);
  }
}
