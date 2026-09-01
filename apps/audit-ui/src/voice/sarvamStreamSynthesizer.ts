import type {
  SpeechSynthesizer,
  SynthesizerListener,
  VoiceLanguage,
} from "./ports.ts";
import {
  sarvamProtocols,
  sarvamSupports,
  SARVAM_SPEAKER,
  ttsSocketUrl,
  type SarvamConfig,
} from "./sarvamContract.ts";
import { fromBase64 } from "./base64.ts";
import { speechChunk } from "./sarvamStreamEvents.ts";
import {
  MediaSourcePlayer,
  streamPlaybackSupported,
  type ChunkPlayer,
} from "./streamPlayer.ts";
import {
  browserSocket,
  socketsAvailable,
  type SocketFactory,
  type SocketLike,
} from "./voiceSocket.ts";

/**
 * Bulbul over the socket: the first audio chunk starts playing while the rest
 * of the sentence is still being generated.
 *
 * The lifecycle is the contract that matters. `speaking` fires once when audio
 * actually starts, and exactly one `done` or `fault` follows — the auto-resume
 * loop in voice mode hands the turn back on that event, so a duplicate would
 * start two recognisers and a missing one would strand the conversation.
 */
export class SarvamStreamSynthesizer implements SpeechSynthesizer {
  readonly id = "sarvam-bulbul-stream";

  private socket: SocketLike | null = null;
  private listener: SynthesizerListener | null = null;
  private generation = 0;
  private speaking = false;

  constructor(
    private readonly config: SarvamConfig,
    private readonly player: ChunkPlayer = new MediaSourcePlayer(),
    private readonly connect: SocketFactory = browserSocket,
  ) {}

  supports(language: VoiceLanguage): boolean {
    return (
      this.config.apiKey !== "" &&
      socketsAvailable() &&
      streamPlaybackSupported() &&
      sarvamSupports(language)
    );
  }

  speak(
    text: string,
    language: VoiceLanguage,
    listen: SynthesizerListener,
  ): void {
    this.cancel();
    const generation = ++this.generation;
    this.listener = listen;
    const settle = this.settler(generation, listen);
    this.player.open(
      () => settle({ kind: "done" }),
      () => settle({ kind: "fault", fault: "failed" }),
    );
    this.socket = this.connect(
      ttsSocketUrl(this.config),
      sarvamProtocols(this.config.apiKey),
      {
        onOpen: (): void => this.send(text, language),
        onMessage: (data): void => this.onMessage(data, generation, settle),
        onClose: (clean): void => {
          if (!clean) settle({ kind: "fault", fault: "network" });
        },
      },
    );
  }

  /**
   * One-shot, and only for the current utterance. A late frame from a socket
   * that `cancel()` already superseded must not report an ending.
   */
  private settler(
    generation: number,
    listen: SynthesizerListener,
  ): (event: Parameters<SynthesizerListener>[0]) => void {
    let done = false;
    return (event): void => {
      if (done || generation !== this.generation) return;
      done = true;
      this.closeSocket();
      listen(event);
    };
  }

  private send(text: string, language: VoiceLanguage): void {
    this.socket?.send(
      JSON.stringify({
        type: "config",
        data: {
          language_code: language,
          speaker: SARVAM_SPEAKER,
          output_audio_codec: "mp3",
        },
      }),
    );
    this.socket?.send(JSON.stringify({ type: "text", data: { text } }));
    this.socket?.send(JSON.stringify({ type: "flush" }));
  }

  private onMessage(
    data: string,
    generation: number,
    settle: (event: Parameters<SynthesizerListener>[0]) => void,
  ): void {
    if (generation !== this.generation) return;
    const chunk = speechChunk(data);
    if (chunk === null) return;
    if (chunk.kind === "audio") {
      this.onAudio(fromBase64(chunk.audio));
      return;
    }
    if (chunk.kind === "final") {
      // The generator is finished; `done` still waits for playback to drain.
      this.player.seal();
      return;
    }
    settle({ kind: "fault", fault: "network" });
  }

  private onAudio(bytes: Uint8Array): void {
    if (!this.speaking) {
      this.speaking = true;
      this.listener?.({ kind: "speaking" });
    }
    this.player.push(bytes);
  }

  cancel(): void {
    this.generation += 1;
    this.speaking = false;
    this.listener = null;
    this.closeSocket();
    this.player.stop();
  }

  private closeSocket(): void {
    this.socket?.close();
    this.socket = null;
  }
}
