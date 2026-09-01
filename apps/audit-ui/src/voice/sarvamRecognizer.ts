import type { LanguageChoice } from "./detectedLanguage.ts";
import type {
  RecognizerListener,
  SpeechRecognizer,
  VoiceFault,
  VoiceLanguage,
} from "./ports.ts";
import {
  captureFault,
  MediaRecorderCapture,
  type AudioCapture,
} from "./audioCapture.ts";
import {
  detectedOf,
  faultOfStatus,
  heardLanguage,
  restLanguage,
  sarvamCall,
  SARVAM_AUTH_HEADER,
  SARVAM_STT_MODEL,
  sarvamSupports,
  transcriptOf,
  type SarvamConfig,
} from "./sarvamContract.ts";

type Heard = { readonly text: string; readonly language: VoiceLanguage };

export class SarvamHttpError extends Error {
  constructor(readonly status: number) {
    super(`sarvam responded ${status}`);
  }
}

/**
 * Saaras, for the Indic languages the browser's own engine handles badly or
 * not at all. Same port as the Web Speech adapter, so the dock never learns
 * which one it is talking to.
 *
 * Honest limitation: this is the batch endpoint, so there are no interim
 * transcripts — one final result when the user stops, with a `transcribing`
 * state in between. See sarvamContract.ts for why the realtime WebSocket is
 * not reachable from a browser.
 */
export class SarvamRecognizer implements SpeechRecognizer {
  readonly id = "sarvam-saaras";

  private listener: RecognizerListener | null = null;
  private choice: LanguageChoice = "en-IN";

  constructor(
    private readonly config: SarvamConfig,
    private readonly capture: AudioCapture = new MediaRecorderCapture(),
  ) {}

  supports(language: LanguageChoice): boolean {
    return this.config.apiKey !== "" && sarvamSupports(language);
  }

  start(language: LanguageChoice, listen: RecognizerListener): void {
    this.listener = listen;
    this.choice = language;
    void this.capture
      .start()
      .then(() => listen({ kind: "listening" }))
      .catch((reason: unknown) => {
        this.listener = null;
        listen({ kind: "fault", fault: captureFault(reason) });
      });
  }

  stop(): void {
    const listen = this.listener;
    if (listen === null) return;
    this.listener = null;
    listen({ kind: "transcribing" });
    void this.finish(listen);
  }

  private async finish(listen: RecognizerListener): Promise<void> {
    try {
      const wav = await this.capture.stop();
      if (wav === null) {
        listen({ kind: "fault", fault: "no-speech" });
        return;
      }
      const heard = await this.transcribe(wav);
      if (heard.text === "") listen({ kind: "fault", fault: "no-speech" });
      else listen({ kind: "final", ...heard });
      listen({ kind: "stopped" });
    } catch (reason) {
      listen({ kind: "fault", fault: faultOfError(reason) });
    }
  }

  private async transcribe(wav: Blob): Promise<Heard> {
    const call = sarvamCall(this.config, "/speech-to-text");
    const body = new FormData();
    body.append("file", wav, "speech.wav");
    body.append("model", SARVAM_STT_MODEL);
    body.append("mode", "transcribe");
    body.append("language_code", restLanguage(this.choice));
    const response = await call.send(call.url, {
      method: "POST",
      headers: { [SARVAM_AUTH_HEADER]: call.key },
      body,
    });
    if (!response.ok) throw new SarvamHttpError(response.status);
    const payload: unknown = await response.json();
    const text = transcriptOf(payload);
    return {
      text,
      language: heardLanguage(text, this.choice, detectedOf(payload)),
    };
  }
}

export function faultOfError(reason: unknown): VoiceFault {
  return reason instanceof SarvamHttpError
    ? faultOfStatus(reason.status)
    : "network";
}
