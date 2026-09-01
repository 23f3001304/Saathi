import type {
  SpeechSynthesizer,
  SynthesizerListener,
  VoiceLanguage,
} from "./ports.ts";
import { faultOfError, SarvamHttpError } from "./sarvamRecognizer.ts";
import {
  audioOf,
  sarvamCall,
  SARVAM_AUTH_HEADER,
  SARVAM_SPEAKER,
  SARVAM_TTS_MODEL,
  sarvamSupports,
  type SarvamConfig,
} from "./sarvamContract.ts";

/** Playing a base64 WAV, injectable so tests never touch an audio device. */
export interface AudioPlayer {
  play(dataUrl: string, onDone: () => void, onFail: () => void): void;
  stop(): void;
}

export class ElementAudioPlayer implements AudioPlayer {
  private current: HTMLAudioElement | null = null;

  play(dataUrl: string, onDone: () => void, onFail: () => void): void {
    this.stop();
    const audio = new Audio(dataUrl);
    this.current = audio;
    audio.onended = (): void => onDone();
    audio.onerror = (): void => onFail();
    void audio.play().catch(() => onFail());
  }

  stop(): void {
    this.current?.pause();
    this.current = null;
  }
}

/**
 * Bulbul, for speaking back in an Indic language the browser has no installed
 * voice for. `cancel()` has to be instant even while the request is still in
 * flight, so a generation counter — not the network — decides whether a
 * returning clip is still wanted.
 */
export class SarvamSynthesizer implements SpeechSynthesizer {
  readonly id = "sarvam-bulbul";

  private generation = 0;

  constructor(
    private readonly config: SarvamConfig,
    private readonly player: AudioPlayer = new ElementAudioPlayer(),
  ) {}

  supports(language: VoiceLanguage): boolean {
    return this.config.apiKey !== "" && sarvamSupports(language);
  }

  speak(
    text: string,
    language: VoiceLanguage,
    listen: SynthesizerListener,
  ): void {
    this.cancel();
    const generation = ++this.generation;
    listen({ kind: "speaking" });
    void this.fetchClip(text, language)
      .then((clip) => this.playClip(clip, generation, listen))
      .catch((reason: unknown) =>
        listen({ kind: "fault", fault: faultOfError(reason) }),
      );
  }

  cancel(): void {
    this.generation += 1;
    this.player.stop();
  }

  private playClip(
    clip: string | null,
    generation: number,
    listen: SynthesizerListener,
  ): void {
    if (generation !== this.generation) return;
    if (clip === null) {
      listen({ kind: "fault", fault: "failed" });
      return;
    }
    this.player.play(
      `data:audio/wav;base64,${clip}`,
      () => listen({ kind: "done" }),
      () => listen({ kind: "fault", fault: "failed" }),
    );
  }

  private async fetchClip(
    text: string,
    language: VoiceLanguage,
  ): Promise<string | null> {
    const call = sarvamCall(this.config, "/text-to-speech");
    const response = await call.send(call.url, {
      method: "POST",
      headers: {
        [SARVAM_AUTH_HEADER]: call.key,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text,
        language_code: language,
        speaker: SARVAM_SPEAKER,
        model: SARVAM_TTS_MODEL,
      }),
    });
    if (!response.ok) throw new SarvamHttpError(response.status);
    return audioOf(await response.json());
  }
}
