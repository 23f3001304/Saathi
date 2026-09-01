import type { LanguageChoice } from "./detectedLanguage.ts";
import type {
  RecognizerListener,
  SpeechRecognizer,
  VoiceFault,
} from "./ports.ts";
import { captureFault } from "./audioCapture.ts";
import {
  heardLanguage,
  SARVAM_CHUNK_BYTES,
  sarvamProtocols,
  socketHandles,
  sttSocketUrl,
  type SarvamConfig,
} from "./sarvamContract.ts";
import {
  FrameBuffer,
  WorkletPcmCapture,
  type PcmCapture,
} from "./pcmCapture.ts";
import {
  browserSocket,
  socketsAvailable,
  SocketRetry,
  type SocketFactory,
  type SocketLike,
} from "./voiceSocket.ts";
import { audioFrame, transcriptEvent } from "./sarvamStreamEvents.ts";

/**
 * Saaras over the realtime socket: partial transcripts arrive while the user
 * is still talking, which is the point of moving off the REST adapter. Two
 * guarantees hold whatever the network does. At most one socket and one
 * capture exist at a time — every path routes through `teardown()`. And no
 * speech is dropped: a socket that dies mid-utterance commits what was
 * already heard as a final rather than losing it to a retry.
 */
export class SarvamStreamRecognizer implements SpeechRecognizer {
  readonly id = "sarvam-saaras-stream";

  private listener: RecognizerListener | null = null;
  private socket: SocketLike | null = null;
  private buffer = new FrameBuffer(SARVAM_CHUNK_BYTES);
  private choice: LanguageChoice = "en-IN";
  private heard = "";
  private opened = false;
  private readonly retry = new SocketRetry();

  constructor(
    private readonly config: SarvamConfig,
    private readonly capture: PcmCapture = new WorkletPcmCapture(),
    private readonly connect: SocketFactory = browserSocket,
  ) {}

  supports(language: LanguageChoice): boolean {
    return (
      this.config.apiKey !== "" && socketsAvailable() && socketHandles(language)
    );
  }

  start(language: LanguageChoice, listen: RecognizerListener): void {
    this.teardown();
    this.listener = listen;
    this.choice = language;
    this.heard = "";
    this.opened = false;
    this.retry.reset();
    void this.begin();
  }

  // Cleared before anything is emitted: `useVoiceInput` calls back into
  // stop() from its own `final` handler, and that must be a no-op.
  stop(): void {
    const listen = this.listener;
    if (listen === null) return;
    this.listener = null;
    this.teardown();
    this.flushPending(listen);
    listen({ kind: "stopped" });
  }

  private async begin(): Promise<void> {
    const listen = this.listener;
    if (listen === null) return;
    try {
      await this.capture.start((frame) => this.onFrame(frame));
    } catch (reason) {
      this.listener = null;
      listen({ kind: "fault", fault: captureFault(reason) });
      return;
    }
    if (this.listener === null) {
      this.capture.stop();
      return;
    }
    this.openSocket();
  }

  private openSocket(): void {
    this.socket?.close();
    this.socket = this.connect(
      sttSocketUrl(this.config, this.choice),
      sarvamProtocols(this.config.apiKey),
      {
        onOpen: (): void => this.onOpen(),
        onMessage: (data): void => this.onMessage(data),
        onClose: (clean): void => this.onClose(clean),
      },
    );
  }

  // The attempt count deliberately survives a successful open; it resets per
  // press. A socket that opens and drops repeatedly would otherwise reset its
  // own retry budget and reconnect for as long as it kept flapping.
  private onOpen(): void {
    this.opened = true;
    this.listener?.({ kind: "listening" });
  }

  private onFrame(frame: Uint8Array): void {
    const chunk = this.buffer.push(frame);
    if (chunk !== null) this.socket?.send(audioFrame(chunk));
  }

  private onMessage(data: string): void {
    const listen = this.listener;
    if (listen === null) return;
    const event = transcriptEvent(data, this.choice);
    if (event === null) return;
    if (event.kind === "interim") {
      this.heard = event.text;
      listen(event);
      return;
    }
    if (event.kind === "final") {
      this.heard = "";
      this.teardown();
      this.listener = null;
      listen(event);
      listen({ kind: "stopped" });
      return;
    }
    if (event.kind === "fault") {
      this.fail(listen, event.fault === "permission-denied");
    }
  }

  /**
   * A drop with speech already heard is not a retry opportunity — the user
   * finished a sentence and is waiting for it. Commit it and end the turn.
   */
  private onClose(clean: boolean): void {
    const listen = this.listener;
    if (listen === null || clean) return;
    this.socket = null;
    this.fail(listen, false);
  }

  private fail(listen: RecognizerListener, fatal: boolean): void {
    if (this.heard.trim() !== "") {
      this.stop();
      return;
    }
    if (!fatal && !this.retry.spent) {
      this.reconnect();
      return;
    }
    this.teardown();
    this.listener = null;
    // Never reached the service, or reached it and lost it? Say which.
    const lost: VoiceFault = this.opened ? "connection-lost" : "network";
    listen({ kind: "fault", fault: fatal ? "permission-denied" : lost });
  }

  private reconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.retry.schedule(() => {
      if (this.listener !== null) this.openSocket();
    });
  }

  private flushPending(listen: RecognizerListener): void {
    const text = this.heard.trim();
    this.heard = "";
    const language = heardLanguage(text, this.choice);
    if (text !== "") listen({ kind: "final", text, language });
  }

  private teardown(): void {
    this.retry.cancel();
    this.socket?.close();
    this.socket = null;
    this.buffer = new FrameBuffer(SARVAM_CHUNK_BYTES);
    this.capture.stop();
  }
}
