import type { VoiceFault, VoiceLanguage } from "./ports.ts";
import { VOICE_LANGUAGES } from "./languages.ts";
import {
  isDetect,
  reportedLanguage,
  SARVAM_ANY,
  speakingLanguage,
  type LanguageChoice,
} from "./detectedLanguage.ts";

// Verified against docs.sarvam.ai on 2026-08-31, not written from memory.
//
//   POST https://api.sarvam.ai/speech-to-text
//     header: api-subscription-key: <key>
//     multipart/form-data: file, model="saaras:v3", mode="transcribe",
//                          language_code ("unknown" detects)
//     200 -> { request_id, transcript, language_code, language_probability }
//
//   POST https://api.sarvam.ai/text-to-speech
//     header: api-subscription-key: <key>
//     json: { text, language_code, speaker, model="bulbul:v3" }
//     200 -> { request_id, audios: [ "<base64 wav>" ] }
//
// The REST pair above is now the *fallback*. Both streaming sockets are live:
//
//   wss://api.sarvam.ai/speech-to-text-realtime/ws
//     ?model=saaras:v3-realtime&language_code=.. ("auto" detects)
//     &encoding=linear16&sample_rate=16000
//     -> { event: "audio_input", audio: "<base64 linear16>" }
//     <- { event: "transcript.partial" | "transcript.final", text, language }
//
//   wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3
//     -> { type: "config", data: {..} } / { type: "text", data: { text } }
//     <- { type: "audio", data: { audio: "<base64 mp3>" } }
//     <- { type: "event", data: { event_type: "final" } }
//
// DECISION: authenticate with the `api-subscription-key.<key>` subprotocol,
// not the header. A browser WebSocket cannot set headers, and Sarvam documents
// the subprotocol form for exactly that reason on the STT socket. The TTS
// socket does *not* document it — but it accepts it, verified against the live
// API on 2026-08-31, so both sockets are reachable from the browser.

export const SARVAM_BASE_URL = "https://api.sarvam.ai";
export const SARVAM_SOCKET_URL = "wss://api.sarvam.ai";
export const SARVAM_AUTH_HEADER = "api-subscription-key";
export const SARVAM_STT_MODEL = "saaras:v3";
export const SARVAM_STREAM_STT_MODEL = "saaras:v3-realtime";
export const SARVAM_TTS_MODEL = "bulbul:v3";
/** The speaker named in Sarvam's own request example. */
export const SARVAM_SPEAKER = "shubh";

/** Sarvam's linear16 frame: 16 kHz mono, and the ~100 ms chunk they document. */
export const SARVAM_SAMPLE_RATE = 16000;
export const SARVAM_CHUNK_BYTES = 3200;

/**
 * Detection has two names on Sarvam's wire, one per endpoint: the REST model
 * takes `unknown` and answers with `language_code`; the realtime socket takes
 * `auto` and answers with `language` on each transcript frame. Both verified
 * against the live API on 2026-08-31, including that the socket rejects
 * `unknown` outright and closes — which is why these stay two constants
 * rather than being tidied into one.
 */
export const SARVAM_STREAM_ANY = "auto";

export function restLanguage(choice: LanguageChoice): string {
  return isDetect(choice) ? SARVAM_ANY : choice;
}

function streamLanguage(choice: LanguageChoice): string {
  return isDetect(choice) ? SARVAM_STREAM_ANY : choice;
}

/**
 * What the transcript turned out to be in: Sarvam's own verdict when it gave
 * one, the script of the words themselves when it did not, and the shopper's
 * explicit choice last.
 */
export function heardLanguage(
  text: string,
  choice: LanguageChoice,
  reported?: unknown,
): VoiceLanguage {
  return reportedLanguage(reported) ?? speakingLanguage(text, null, choice);
}

/** The code Sarvam reports on a REST transcription, detected or echoed. */
export function detectedOf(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) return null;
  return (payload as { language_code?: unknown }).language_code;
}

/**
 * The whole reason the sockets work from a browser. The key travels as a
 * subprotocol token because the handshake has nowhere else to put it, and
 * Sarvam echoes it back on accept.
 */
export function sarvamProtocols(key: string): readonly string[] {
  return [`${SARVAM_AUTH_HEADER}.${key}`];
}

export function sttSocketUrl(
  config: SarvamConfig,
  choice: LanguageChoice,
): string {
  const base = config.socketUrl ?? SARVAM_SOCKET_URL;
  const query = new URLSearchParams({
    model: SARVAM_STREAM_STT_MODEL,
    language_code: streamLanguage(choice),
    encoding: "linear16",
    sample_rate: String(SARVAM_SAMPLE_RATE),
  });
  return `${base}/speech-to-text-realtime/ws?${query.toString()}`;
}

export function ttsSocketUrl(config: SarvamConfig): string {
  const base = config.socketUrl ?? SARVAM_SOCKET_URL;
  const query = new URLSearchParams({
    model: SARVAM_TTS_MODEL,
    send_completion_event: "true",
  });
  return `${base}/text-to-speech/ws?${query.toString()}`;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type SarvamConfig = {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly socketUrl?: string;
  readonly fetch?: FetchLike;
};

export type SarvamCall = {
  readonly url: string;
  readonly send: FetchLike;
  readonly key: string;
};

export function sarvamCall(config: SarvamConfig, path: string): SarvamCall {
  return {
    url: `${config.baseUrl ?? SARVAM_BASE_URL}${path}`,
    send: config.fetch ?? ((input, init) => fetch(input, init)),
    key: config.apiKey,
  };
}

/**
 * Bulbul covers the whole picker today, but the check reads the table rather
 * than answering `true`: when a language is added on one side only, this is
 * the line that has to notice.
 */
export function sarvamSupports(language: LanguageChoice): boolean {
  if (isDetect(language)) return true;
  return VOICE_LANGUAGES.some((option) => option.code === language);
}

export function transcriptOf(payload: unknown): string {
  if (typeof payload !== "object" || payload === null) return "";
  const transcript = (payload as { transcript?: unknown }).transcript;
  return typeof transcript === "string" ? transcript.trim() : "";
}

export function audioOf(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const audios = (payload as { audios?: unknown }).audios;
  if (!Array.isArray(audios)) return null;
  const first: unknown = audios[0];
  return typeof first === "string" && first !== "" ? first : null;
}

/** HTTP status is the only signal Sarvam gives for a rejected key or quota. */
export function faultOfStatus(status: number): VoiceFault {
  if (status === 401 || status === 403) return "permission-denied";
  return "network";
}

/**
 * Whether the realtime socket should take this turn.
 *
 * It declines detection. On identical audio the REST model answered `hi-IN` at
 * 0.998 and transcribed Devanagari, while this socket asked with `auto`
 * answered `en-IN` at 0.56 in romanised text and read Tamil as "I want a
 * shirt". Declining sends the ladder to REST: a detected turn trades its
 * streaming partials for a transcript in the language actually spoken, and a
 * shopper who names their language still gets the socket. Latency is a lesser
 * failure than hearing Hindi as English.
 */
export function socketHandles(language: LanguageChoice): boolean {
  return !isDetect(language) && sarvamSupports(language);
}
