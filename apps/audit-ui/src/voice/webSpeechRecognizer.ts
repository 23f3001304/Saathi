import { isDetect, type LanguageChoice } from "./detectedLanguage.ts";
import { DEFAULT_LANGUAGE } from "./languages.ts";
import type {
  RecognizerListener,
  SpeechRecognizer,
  VoiceLanguage,
} from "./ports.ts";
import {
  faultOfCode,
  speechRecognitionCtor,
  type SpeechRecognitionCtor,
  type SpeechRecognitionLike,
  type SpeechResultEventLike,
} from "./webSpeechTypes.ts";

/**
 * The browser's own recogniser — zero dependencies, zero API keys, works
 * offline-ish wherever the vendor's engine is bundled. It is the default
 * because the cheapest voice input is the one already installed.
 *
 * Every documented failure of this API (no engine, denied permission, no
 * device, dead service) leaves through the same `fault` event, so the dock
 * has exactly one thing to render and never a thrown exception inside a
 * pointer handler.
 */
export class WebSpeechRecognizer implements SpeechRecognizer {
  readonly id = "web-speech";

  private engine: SpeechRecognitionLike | null = null;

  constructor(
    private readonly ctor: SpeechRecognitionCtor | null = speechRecognitionCtor(),
  ) {}

  supports(): boolean {
    return this.ctor !== null;
  }

  // It cannot detect, so "detect" becomes the default language and the
  // transcript is reported as that — an honest answer rather than a guess
  // dressed up as one.
  start(language: LanguageChoice, listen: RecognizerListener): void {
    this.stop();
    const engine = this.build(listen);
    if (engine === null) return;
    const spoken = isDetect(language) ? DEFAULT_LANGUAGE : language;
    engine.lang = spoken;
    // One utterance per press: the engine finalises on its own end-of-speech,
    // which is what "say a thing and have it sent" means. Continuous mode
    // would keep the mic hot after the sentence the user meant to send.
    engine.continuous = false;
    engine.interimResults = true;
    engine.maxAlternatives = 1;
    this.engine = engine;
    this.attach(engine, listen, spoken);
    try {
      engine.start();
    } catch {
      // Thrown on a second start(), and on an insecure origin.
      this.engine = null;
      listen({ kind: "fault", fault: "failed" });
    }
  }

  stop(): void {
    const engine = this.engine;
    if (engine === null) return;
    try {
      engine.stop();
    } catch {
      // A stop() on an engine that never started is not worth a state change.
    }
  }

  private build(listen: RecognizerListener): SpeechRecognitionLike | null {
    const ctor = this.ctor;
    if (ctor === null) {
      listen({ kind: "fault", fault: "unsupported" });
      return null;
    }
    try {
      return new ctor();
    } catch {
      listen({ kind: "fault", fault: "unsupported" });
      return null;
    }
  }

  private attach(
    engine: SpeechRecognitionLike,
    listen: RecognizerListener,
    language: VoiceLanguage,
  ): void {
    engine.onstart = (): void => listen({ kind: "listening" });
    engine.onresult = (event): void => emitResults(event, listen, language);
    engine.onerror = (event): void => {
      // Cleared first so the `end` that always follows an error cannot report
      // a tidy "stopped" on top of the fault the user needs to see.
      this.engine = null;
      listen({ kind: "fault", fault: faultOfCode(event.error) });
    };
    engine.onend = (): void => {
      if (this.engine !== engine) return;
      this.engine = null;
      listen({ kind: "stopped" });
    };
  }
}

function emitResults(
  event: SpeechResultEventLike,
  listen: RecognizerListener,
  language: VoiceLanguage,
): void {
  let interim = "";
  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    const text = result[0].transcript;
    if (result.isFinal) listen({ kind: "final", text: text.trim(), language });
    else interim += text;
  }
  const pending = interim.trim();
  if (pending !== "") listen({ kind: "interim", text: pending });
}
