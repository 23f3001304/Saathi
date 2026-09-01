import type { SseFrame } from "../src/providers/sse-stream.js";
import { readSseFrames } from "../src/providers/sse-stream.js";
import type { DraftScope } from "../src/providers/turn-stream.js";
import { SILENT_DRAFT } from "../src/providers/turn-stream.js";

/** Frames a body the way a vendor does, in chunks that split mid-frame. */
export function sse(text: string, chunk = 7): AsyncIterable<SseFrame> {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      for (let at = 0; at < bytes.length; at += chunk) {
        controller.enqueue(bytes.slice(at, at + chunk));
      }
      controller.close();
    },
  });
  return readSseFrames(body);
}

export interface Collector {
  readonly seen: string[];
  delta: (text: string) => void;
}

export function collector(): Collector {
  const seen: string[] = [];
  return { seen, delta: (text) => void seen.push(text) };
}

/** One draft per round trip, the way `runGuardedTurn` asks for them. */
export function scopeOf(stream: Collector): DraftScope {
  return { open: () => ({ ...SILENT_DRAFT, delta: stream.delta }) };
}

export interface RecordedDraft {
  text: string;
  verdict: string;
}

/** A scope that remembers what each round trip wrote and what became of it. */
export function recordingScope(): {
  readonly opened: RecordedDraft[];
  readonly scope: DraftScope;
} {
  const opened: RecordedDraft[] = [];
  return {
    opened,
    scope: {
      open: () => {
        const held: RecordedDraft = { text: "", verdict: "open" };
        opened.push(held);
        return {
          id: `d${opened.length}`,
          delta: (text: string) => {
            held.text += text;
          },
          settle: () => {
            held.verdict = "settled";
          },
          withdraw: (reason: string) => {
            held.verdict = reason;
          },
        };
      },
    },
  };
}
