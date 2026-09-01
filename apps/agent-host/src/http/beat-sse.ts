import type { BeatCursor } from "./beat-cursor.js";
import type { BeatHub, BeatSink } from "./beat-hub.js";

/**
 * `id: <index>\ndata: <json>\n\n` — the same SSE shape `/ledger/stream` uses,
 * and the shape `apps/audit-ui/tests/live-sse-wire.test.ts` pins.
 *
 * The rebase notice is a *named* event on purpose: `EventSource.onmessage`
 * reads only unnamed frames, so a client that knows to listen for it is told
 * the indices were rebased while one that does not sees the beat framing it
 * has always seen.
 */
function sseSink(
  write: (chunk: string) => void,
  controller: ReadableStreamDefaultController<Uint8Array>,
  heartbeat: NodeJS.Timeout,
): BeatSink {
  return {
    deliver: (_epoch, index, beat) => {
      write(`id: ${index}\ndata: ${JSON.stringify(beat)}\n\n`);
    },
    rebase: (epoch) => {
      write(`event: rebase\ndata: ${JSON.stringify({ epoch })}\n\n`);
    },
    close: () => {
      clearInterval(heartbeat);
      closeQuietly(controller);
    },
  };
}

/** The fallback rung, unchanged on the wire: one replay, then the follow. */
export function openSseStream(
  hub: BeatHub,
  cursor: BeatCursor,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let detach: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  return new ReadableStream<Uint8Array>({
    start: (controller) => {
      const write = (chunk: string): void => {
        safeSend(controller, encoder, chunk);
      };
      heartbeat = setInterval(() => {
        write(": hb\n\n");
      }, hub.heartbeatMs);
      heartbeat.unref();
      detach = hub.subscribe(sseSink(write, controller, heartbeat), cursor);
    },
    cancel: () => {
      if (heartbeat !== null) clearInterval(heartbeat);
      detach?.();
    },
  });
}

/** A client that vanished mid-write must not take the publisher down. */
function safeSend(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  chunk: string,
): void {
  try {
    controller.enqueue(encoder.encode(chunk));
  } catch {
    // The socket is gone; `cancel` has already been scheduled.
  }
}

function closeQuietly(
  controller: ReadableStreamDefaultController<Uint8Array>,
): void {
  try {
    controller.close();
  } catch {
    // Already closed by the peer.
  }
}
