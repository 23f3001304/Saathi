import type { VoiceFault } from "./ports.ts";

/** getUserMedia's rejection name is the only signal for why it said no. */
export function captureFault(reason: unknown): VoiceFault {
  const name = reason instanceof Error ? reason.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "permission-denied";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "no-microphone";
  }
  return "failed";
}

/**
 * Recording the microphone to a blob Sarvam will accept. Split out from the
 * recogniser so the adapter can be tested with a scripted capture and no
 * browser media stack at all.
 */
export interface AudioCapture {
  start(): Promise<void>;
  /** Resolves with 16-bit PCM WAV, or null when nothing was captured. */
  stop(): Promise<Blob | null>;
  cancel(): void;
}

type AudioContextCtor = new () => AudioContext;

/**
 * DECISION: transcode to WAV before upload. MediaRecorder emits webm/opus (or
 * mp4 on Safari) and never wav; Sarvam documents wav/mp3/aac/pcm_s16le. Rather
 * than gamble that their decoder happens to take a webm container, the blob is
 * decoded with the Web Audio API — which understands whatever the recorder
 * just produced — and re-written as the format their docs actually name.
 */
export class MediaRecorderCapture implements AudioCapture {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    this.chunks = [];
    recorder.ondataavailable = (event): void => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder = recorder;
    recorder.start();
  }

  async stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    if (recorder === null) return null;
    this.recorder = null;
    const recorded = await new Promise<Blob>((resolve) => {
      recorder.onstop = (): void => resolve(new Blob(this.chunks));
      recorder.stop();
    });
    recorder.stream.getTracks().forEach((track) => track.stop());
    return recorded.size === 0 ? null : await toWav(recorded);
  }

  cancel(): void {
    const recorder = this.recorder;
    this.recorder = null;
    this.chunks = [];
    if (recorder === null) return;
    recorder.stop();
    recorder.stream.getTracks().forEach((track) => track.stop());
  }
}

async function toWav(recorded: Blob): Promise<Blob> {
  const scope = window as unknown as { AudioContext?: AudioContextCtor };
  const ctor = scope.AudioContext;
  if (ctor === undefined) return recorded;
  const context = new ctor();
  try {
    const audio = await context.decodeAudioData(await recorded.arrayBuffer());
    return new Blob([encodeWav(audio)], { type: "audio/wav" });
  } finally {
    void context.close().catch(() => undefined);
  }
}

/** Mono 16-bit PCM: the smallest thing every speech API is documented to read. */
export function encodeWav(audio: AudioBuffer): ArrayBuffer {
  const samples = audio.getChannelData(0);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeHeader(view, samples.length, audio.sampleRate);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped * 0x7fff, true);
  }
  return buffer;
}

function writeHeader(view: DataView, count: number, rate: number): void {
  const bytes = count * 2;
  writeTag(view, 0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  writeTag(view, 8, "WAVE");
  writeTag(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeTag(view, 36, "data");
  view.setUint32(40, bytes, true);
}

function writeTag(view: DataView, offset: number, tag: string): void {
  for (let i = 0; i < tag.length; i += 1) {
    view.setUint8(offset + i, tag.charCodeAt(i));
  }
}
