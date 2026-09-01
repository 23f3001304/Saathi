/**
 * Playing audio that is still arriving. Injectable so a test can assert the
 * lifecycle without a decoder.
 */
export interface ChunkPlayer {
  /** `onDone` fires once, after the last pushed byte has finished playing. */
  open(onDone: () => void, onFail: () => void): void;
  push(bytes: Uint8Array): void;
  /** No further chunks are coming. */
  seal(): void;
  stop(): void;
}

const MIME = "audio/mpeg";

export function streamPlaybackSupported(): boolean {
  const scope = globalThis as unknown as {
    MediaSource?: { isTypeSupported(mime: string): boolean };
  };
  return scope.MediaSource?.isTypeSupported(MIME) ?? false;
}

/**
 * DECISION: MediaSource, not one `Audio` per chunk. Sarvam's chunks are slices
 * of a single continuous MP3 byte stream — only the first carries a frame
 * header, verified against the live API — so decoding them individually does
 * not work. Appending to one SourceBuffer plays the stream as it arrives.
 */
export class MediaSourcePlayer implements ChunkPlayer {
  private audio: HTMLAudioElement | null = null;
  private media: MediaSource | null = null;
  private buffer: SourceBuffer | null = null;
  private pending: Uint8Array[] = [];
  private sealed = false;
  private settled = false;
  private objectUrl = "";

  open(onDone: () => void, onFail: () => void): void {
    this.stop();
    this.settled = false;
    this.sealed = false;
    this.pending = [];
    const media = new MediaSource();
    this.media = media;
    this.objectUrl = URL.createObjectURL(media);
    const audio = new Audio(this.objectUrl);
    this.audio = audio;
    audio.onended = (): void => this.settle(onDone);
    audio.onerror = (): void => this.settle(onFail);
    media.addEventListener("sourceopen", () => this.onSourceOpen(media));
  }

  private onSourceOpen(media: MediaSource): void {
    if (this.media !== media || this.buffer !== null) return;
    try {
      const buffer = media.addSourceBuffer(MIME);
      this.buffer = buffer;
      buffer.addEventListener("updateend", () => this.pump());
      this.pump();
    } catch {
      this.settle(() => undefined);
    }
  }

  push(bytes: Uint8Array): void {
    if (this.media === null) return;
    this.pending.push(bytes);
    this.pump();
    // Playback starts on the first chunk; the rest arrive underneath it.
    void this.audio?.play().catch(() => undefined);
  }

  seal(): void {
    this.sealed = true;
    this.pump();
  }

  private pump(): void {
    const buffer = this.buffer;
    if (buffer === null || buffer.updating) return;
    const next = this.pending.shift();
    if (next !== undefined) {
      appendSafely(buffer, next);
      return;
    }
    if (this.sealed) this.endStream();
  }

  private endStream(): void {
    const media = this.media;
    if (media === null || media.readyState !== "open") return;
    try {
      media.endOfStream();
    } catch {
      // A source torn down between the check and the call needs no handling.
    }
  }

  private settle(run: () => void): void {
    if (this.settled) return;
    this.settled = true;
    run();
  }

  stop(): void {
    this.settled = true;
    this.audio?.pause();
    if (this.audio !== null) {
      this.audio.onended = null;
      this.audio.onerror = null;
    }
    this.audio = null;
    this.media = null;
    this.buffer = null;
    this.pending = [];
    if (this.objectUrl !== "") URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = "";
  }
}

function appendSafely(buffer: SourceBuffer, bytes: Uint8Array): void {
  try {
    buffer.appendBuffer(bytes as unknown as BufferSource);
  } catch {
    // QuotaExceeded on a very long reply; what is buffered still plays.
  }
}
