import { toBase64 } from "./base64.ts";
import type { LanguageChoice } from "./detectedLanguage.ts";
import type { RecognizerEvent } from "./ports.ts";
import { heardLanguage } from "./sarvamContract.ts";

function parseObject(data: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(data);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function textOf(frame: Record<string, unknown>): string {
  return typeof frame.text === "string" ? frame.text.trim() : "";
}

/** The client half of the realtime wire format. */
export function audioFrame(chunk: Uint8Array): string {
  return JSON.stringify({ event: "audio_input", audio: toBase64(chunk) });
}

/**
 * Sarvam's realtime frames, narrowed to the three the dock acts on. Every
 * other event — session.begin, vad.*, pong — is real and documented but does
 * not change what is on screen, so it is dropped here rather than travelling
 * up as a state the machine would have to ignore.
 */
export function transcriptEvent(
  data: string,
  choice: LanguageChoice,
): RecognizerEvent | null {
  const frame = parseObject(data);
  if (frame === null) return null;
  switch (frame.event) {
    case "transcript.partial":
      return partial(textOf(frame));
    case "transcript.final":
      return final(textOf(frame), choice, frame.language);
    case "error":
      return {
        kind: "fault",
        fault: frame.is_fatal === true ? "permission-denied" : "network",
      };
    default:
      return null;
  }
}

function partial(text: string): RecognizerEvent | null {
  return text === "" ? null : { kind: "interim", text };
}

// `language` rides along only when detection was asked for; an explicit
// choice comes back with no verdict at all, which is not a missing answer.
function final(
  text: string,
  choice: LanguageChoice,
  reported: unknown,
): RecognizerEvent | null {
  if (text === "") return null;
  return {
    kind: "final",
    text,
    language: heardLanguage(text, choice, reported),
  };
}

export type SpeechChunk =
  | { readonly kind: "audio"; readonly audio: string }
  | { readonly kind: "final" }
  | { readonly kind: "error" };

function payloadOf(frame: Record<string, unknown>): Record<string, unknown> {
  return typeof frame.data === "object" && frame.data !== null
    ? (frame.data as Record<string, unknown>)
    : {};
}

/** The TTS socket speaks a different dialect: `type`, and a nested `data`. */
export function speechChunk(data: string): SpeechChunk | null {
  const frame = parseObject(data);
  if (frame === null) return null;
  const payload = payloadOf(frame);
  switch (frame.type) {
    case "audio":
      return typeof payload.audio === "string"
        ? { kind: "audio", audio: payload.audio }
        : null;
    case "event":
      return payload.event_type === "final" ? { kind: "final" } : null;
    case "error":
      return { kind: "error" };
    default:
      return null;
  }
}
