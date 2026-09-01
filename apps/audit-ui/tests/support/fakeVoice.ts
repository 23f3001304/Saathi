// Fake speech adapters. Every voice test drives these; none of them touches a
// real microphone, a real network call or a real audio device.
import type { LanguageChoice } from "../../src/voice/detectedLanguage.ts";
import type {
  AmplitudeMeter,
  RecognizerEvent,
  RecognizerListener,
  SpeechRecognizer,
  SpeechSynthesizer,
  SynthesizerListener,
  VoiceKit,
  VoiceLanguage,
} from "../../src/voice/ports.ts";

/** A `final` must name a language; a test that is not about language says so
 *  by leaving it out, and gets the same answer an engine that cannot detect
 *  would give. */
type Emitted =
  | Exclude<RecognizerEvent, { kind: "final" }>
  | { kind: "final"; text: string; language?: VoiceLanguage };

export class FakeRecognizer implements SpeechRecognizer {
  readonly id = "fake-recognizer";
  readonly starts: LanguageChoice[] = [];
  stops = 0;

  private listener: RecognizerListener | null = null;

  constructor(private readonly supported = true) {}

  supports(): boolean {
    return this.supported;
  }

  start(language: LanguageChoice, listen: RecognizerListener): void {
    this.starts.push(language);
    this.listener = listen;
  }

  stop(): void {
    this.stops += 1;
  }

  /** Plays an engine event back into whatever is listening. */
  emit(event: Emitted): void {
    this.listener?.(
      event.kind === "final"
        ? { ...event, language: event.language ?? "en-IN" }
        : event,
    );
  }
}

export class FakeSynthesizer implements SpeechSynthesizer {
  readonly id = "fake-synthesizer";
  readonly spoken: string[] = [];
  readonly languages: VoiceLanguage[] = [];
  cancels = 0;

  private listener: SynthesizerListener | null = null;

  constructor(private readonly supported = true) {}

  supports(): boolean {
    return this.supported;
  }

  speak(
    text: string,
    language: VoiceLanguage,
    listen: SynthesizerListener,
  ): void {
    this.spoken.push(text);
    this.languages.push(language);
    this.listener = listen;
    listen({ kind: "speaking" });
  }

  cancel(): void {
    this.cancels += 1;
  }

  finish(): void {
    this.listener?.({ kind: "done" });
  }
}

export class FakeMeter implements AmplitudeMeter {
  starts = 0;
  stops = 0;

  private onLevel: ((level: number) => void) | null = null;

  start(onLevel: (level: number) => void): void {
    this.starts += 1;
    this.onLevel = onLevel;
  }

  stop(): void {
    this.stops += 1;
  }

  emit(level: number): void {
    this.onLevel?.(level);
  }
}

export type FakeKit = VoiceKit & {
  readonly recognizer: FakeRecognizer;
  readonly synthesizer: FakeSynthesizer;
  readonly meter: FakeMeter;
};

export function fakeKit(supported = true): FakeKit {
  return {
    recognizer: new FakeRecognizer(supported),
    synthesizer: new FakeSynthesizer(),
    meter: new FakeMeter(),
  };
}
