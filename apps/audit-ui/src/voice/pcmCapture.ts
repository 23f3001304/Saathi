import { SARVAM_SAMPLE_RATE } from "./sarvamContract.ts";
import { toLinear16 } from "./base64.ts";

/**
 * The microphone as a stream of PCM frames, rather than one blob at the end.
 * Injectable for the same reason `AudioCapture` is: a test should be able to
 * push three frames and assert on what went up the socket.
 */
export interface PcmCapture {
  start(onFrame: (pcm: Uint8Array) => void): Promise<void>;
  stop(): void;
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

/**
 * DECISION: an AudioWorklet, loaded from a blob URL, not a ScriptProcessorNode.
 * ScriptProcessor is deprecated and runs the conversion on the main thread —
 * the thread also drawing the live orb. The worklet source is inlined because
 * it is four lines and a separate asset file would have to survive bundling.
 */
const WORKLET_SOURCE = `
registerProcessor('pcm-tap', class extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(new Float32Array(channel));
    return true;
  }
});`;

export class WorkletPcmCapture implements PcmCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;

  async start(onFrame: (pcm: Uint8Array) => void): Promise<void> {
    const ctor = audioContextCtor();
    if (ctor === null) throw new Error("no AudioContext");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Asking for the rate Sarvam wants makes the browser resample for us.
    const context = new ctor({ sampleRate: SARVAM_SAMPLE_RATE });
    this.context = context;
    const node = await this.buildNode(context, onFrame);
    context.createMediaStreamSource(this.stream).connect(node);
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    const context = this.context;
    this.context = null;
    void context?.close().catch(() => undefined);
  }

  private async buildNode(
    context: AudioContext,
    onFrame: (pcm: Uint8Array) => void,
  ): Promise<AudioWorkletNode> {
    const url = URL.createObjectURL(
      new Blob([WORKLET_SOURCE], { type: "text/javascript" }),
    );
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(context, "pcm-tap");
    node.port.onmessage = (event: MessageEvent): void => {
      onFrame(toLinear16(event.data as Float32Array));
    };
    return node;
  }
}

function audioContextCtor(): AudioContextCtor | null {
  const scope = globalThis as unknown as { AudioContext?: AudioContextCtor };
  return scope.AudioContext ?? null;
}

/**
 * Frames arrive at the worklet's 128-sample cadence, which is far smaller than
 * the ~100 ms chunk Sarvam documents. Coalescing here keeps the socket from
 * carrying a JSON envelope per 8 ms of speech.
 */
export class FrameBuffer {
  private held: Uint8Array[] = [];
  private size = 0;

  constructor(private readonly target: number) {}

  push(frame: Uint8Array): Uint8Array | null {
    this.held.push(frame);
    this.size += frame.length;
    return this.size >= this.target ? this.drain() : null;
  }

  drain(): Uint8Array | null {
    if (this.size === 0) return null;
    const merged = new Uint8Array(this.size);
    let offset = 0;
    for (const frame of this.held) {
      merged.set(frame, offset);
      offset += frame.length;
    }
    this.held = [];
    this.size = 0;
    return merged;
  }
}
