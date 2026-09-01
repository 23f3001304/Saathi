import type { VoiceFault } from "./ports.ts";

// The Web Speech recognition half is still not in every TypeScript DOM lib,
// and `webkitSpeechRecognition` never will be. These are the members this
// app actually touches, declared here so the adapter needs no `any`.

export interface SpeechAlternativeLike {
  readonly transcript: string;
}

export interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternativeLike;
}

export interface SpeechResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechResultLike;
}

export interface SpeechResultEventLike {
  readonly resultIndex: number;
  readonly results: SpeechResultListLike;
}

export interface SpeechErrorEventLike {
  readonly error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechCapableWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

/**
 * Chromium and Safari both still ship this only under the `webkit` prefix in
 * 2026; Firefox ships neither. Returning null rather than throwing is the
 * whole point — "no engine here" is a state the dock renders, not a crash.
 */
export function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as SpeechCapableWindow;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const FAULT_BY_CODE: Readonly<Record<string, VoiceFault>> = {
  "not-allowed": "permission-denied",
  "service-not-allowed": "permission-denied",
  "audio-capture": "no-microphone",
  "no-speech": "no-speech",
  "language-not-supported": "language-unsupported",
  network: "network",
  aborted: "aborted",
};

/** Spec error codes are strings, and browsers invent new ones; default honestly. */
export function faultOfCode(code: string): VoiceFault {
  return FAULT_BY_CODE[code] ?? "failed";
}
