// §12 ports & adapters, applied to speech. Nothing below names a browser API
// or a vendor: the dock talks to these four interfaces and never to an engine.

/**
 * BCP-47 with the Indian region subtag — the exact form both the browser's
 * Web Speech API and Sarvam's Saaras/Bulbul models accept unchanged, so a
 * language choice needs no translation table on the way to either adapter.
 */
export type VoiceLanguage =
  | "en-IN"
  | "hi-IN"
  | "bn-IN"
  | "ta-IN"
  | "te-IN"
  | "mr-IN"
  | "kn-IN"
  | "gu-IN"
  | "ml-IN";

/**
 * Every way speech can fail, named. The point of the closed union is that the
 * dock must render *something* honest for each one — a silent no-op after the
 * user has pressed a microphone is the failure mode this type exists to make
 * impossible.
 */
export type VoiceFault =
  | "unsupported"
  | "permission-denied"
  | "no-microphone"
  | "no-speech"
  | "language-unsupported"
  | "network"
  // Distinct from `network`: the socket opened and then kept dropping, which
  // is a different sentence to the user and a different decision for the
  // ladder than never having reached the service at all.
  | "connection-lost"
  | "aborted"
  | "failed";

/**
 * "Detect" is a language the shopper can choose: it asks the engine to work out
 * what it heard rather than being told. It lives here, beside `VoiceLanguage`,
 * because it is part of what a port accepts — putting it in the module that
 * *interprets* detection made `ports` depend on that module and the two import
 * each other.
 */
export const DETECT = "detect";

export type LanguageChoice = VoiceLanguage | typeof DETECT;

export type RecognizerEvent =
  | { readonly kind: "listening" }
  | { readonly kind: "interim"; readonly text: string }
  // Batch engines stop hearing before they finish transcribing. Without its
  // own event the dock would keep drawing a live waveform over a dead mic.
  | { readonly kind: "transcribing" }
  // The language is part of the result, not of the request: the shopper may
  // not have chosen one, and the reply has to be spoken in whatever they
  // actually spoke. An engine that cannot detect answers with what it was
  // asked for, which is the truth about that engine.
  | {
      readonly kind: "final";
      readonly text: string;
      readonly language: VoiceLanguage;
    }
  | { readonly kind: "stopped" }
  | { readonly kind: "fault"; readonly fault: VoiceFault };

export type RecognizerListener = (event: RecognizerEvent) => void;

export interface SpeechRecognizer {
  /** Named so a fault message can say which engine could not do the job. */
  readonly id: string;
  /** Answerable before any microphone is touched, so the UI can pre-disable. */
  supports(language: LanguageChoice): boolean;
  start(language: LanguageChoice, listen: RecognizerListener): void;
  stop(): void;
}

export type SynthesizerEvent =
  | { readonly kind: "speaking" }
  | { readonly kind: "done" }
  | { readonly kind: "fault"; readonly fault: VoiceFault };

export type SynthesizerListener = (event: SynthesizerEvent) => void;

export interface SpeechSynthesizer {
  readonly id: string;
  supports(language: VoiceLanguage): boolean;
  speak(
    text: string,
    language: VoiceLanguage,
    listen: SynthesizerListener,
  ): void;
  cancel(): void;
}

/**
 * Real input loudness, 0..1, sampled from the microphone. Separate from
 * `SpeechRecognizer` on purpose: the Web Speech API never hands back the
 * stream it is listening to, so the waveform needs its own capture. Keeping
 * it a distinct port means a failed meter costs the user a decoration, not
 * the ability to talk.
 */
export interface AmplitudeMeter {
  start(onLevel: (level: number) => void): void;
  stop(): void;
}

export interface VoiceKit {
  readonly recognizer: SpeechRecognizer;
  readonly synthesizer: SpeechSynthesizer;
  readonly meter: AmplitudeMeter | null;
}
