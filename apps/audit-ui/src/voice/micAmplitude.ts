import type { AmplitudeMeter } from "./ports.ts";

/** ~16 fps. Enough for a waveform to read as live; a third of the renders. */
const SAMPLE_MS = 60;
/** Quantise so ambient noise floor doesn't re-render the dock forever. */
const STEPS = 32;

type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { AudioContext?: AudioContextCtor };
  return scope.AudioContext ?? null;
}

/**
 * The waveform's actual source: RMS of the live microphone, not a timer
 * pretending to be one. A fake pulse looks identical whether the mic is
 * working or muted, which is exactly when the user needs to be able to tell.
 *
 * Failures here are deliberately quiet — the recogniser is already reporting
 * microphone faults as dock state, and a second copy of the same bad news is
 * noise. The visible consequence is a flat thread, which is honest.
 */
export class WebAudioAmplitudeMeter implements AmplitudeMeter {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private timer: number | null = null;
  private generation = 0;

  start(onLevel: (level: number) => void): void {
    this.stop();
    const ctor = audioContextCtor();
    const media = globalThis.navigator?.mediaDevices;
    if (ctor === null || media === undefined) return;
    const generation = ++this.generation;
    void media
      .getUserMedia({ audio: true })
      .then((stream) => this.attach(stream, ctor, generation, onLevel))
      .catch(() => undefined);
  }

  stop(): void {
    this.generation += 1;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }

  private attach(
    stream: MediaStream,
    ctor: AudioContextCtor,
    generation: number,
    onLevel: (level: number) => void,
  ): void {
    // getUserMedia resolves after the user has already let go of the button
    // often enough that this guard is load-bearing, not defensive padding.
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    const context = new ctor();
    this.context = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    this.poll(analyser, onLevel);
  }

  private poll(analyser: AnalyserNode, onLevel: (level: number) => void): void {
    const frame = new Uint8Array(analyser.fftSize);
    let last = -1;
    this.timer = setInterval(() => {
      analyser.getByteTimeDomainData(frame);
      const level = Math.round(rms(frame) * STEPS) / STEPS;
      if (level === last) return;
      last = level;
      onLevel(level);
    }, SAMPLE_MS) as unknown as number;
  }
}

/** 0..1, with a gain that makes ordinary speech fill most of the range. */
function rms(frame: Uint8Array): number {
  let sum = 0;
  for (const sample of frame) {
    const centred = (sample - 128) / 128;
    sum += centred * centred;
  }
  return Math.min(1, Math.sqrt(sum / frame.length) * 3.2);
}
