// The frame side of the sandbox seam, split out of liveBrowser.ts so that file
// reads as "what to poll and when" rather than also carrying the socket.
import { get, handshake, scoped, streamUrl } from "./browserKey.ts";
import { repeat } from "./browserPoll.ts";
import type { Wire } from "./browserPoll.ts";
import { parseFrame } from "./browserWire.ts";
import type { ParsedCapture } from "./browserWire.ts";

export const FRAME_INTERVAL_MS = 500;

/**
 * How long the stream may go quiet before the shutter takes over. Longer than
 * a working cast's gap between frames, so a healthy stream never trips it.
 */
export const STREAM_QUIET_MS = 2_000;

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function readFrame(wire: Wire): Promise<void> {
  try {
    const res = await get(wire.base, scoped("/browser/frame", wire.conversation));
    if (!res.ok) return;
    emitCapture(wire, parseFrame(await res.json()));
  } catch {
    // The state poll is the liveness check; a missed frame is just a missed
    // frame, and a host that skipped one rather than shipping raw pixels is
    // the host behaving correctly.
  }
}

/**
 * `EventSource` sends no headers, so the sandbox key rides in the query string
 * — which means the URL is stamped with whatever key was held when the stream
 * was opened. agent-host mints a new key every boot, so one restart left an
 * open tab subscribing with a dead key and watching a placeholder while the
 * host was capturing frames perfectly well. One re-handshake and one retry
 * before giving up on the socket; only then the poll.
 */
export function streamFrames(wire: Wire, retried = false): void {
  if (wire.stopped) return;
  if (typeof EventSource === "undefined") {
    repeat(wire, FRAME_INTERVAL_MS, () => readFrame(wire));
    return;
  }
  const source = new EventSource(streamUrl(wire.base, wire.conversation));
  wire.source = source;
  source.onmessage = (event: MessageEvent<string>) => {
    emitCapture(wire, parseFrame(safeJson(event.data)));
  };
  source.onerror = () => {
    source.close();
    wire.source = null;
    if (wire.stopped) return;
    if (retried) {
      repeat(wire, FRAME_INTERVAL_MS, () => readFrame(wire));
      return;
    }
    void handshake(wire.base)
      .then(() => streamFrames(wire, true))
      .catch(() => repeat(wire, FRAME_INTERVAL_MS, () => readFrame(wire)));
  };
}

/**
 * Watching a window, by whichever half is actually delivering.
 *
 * DECISION: the shutter is not the fallback for a stream that *errors*, it is
 * the fallback for a stream that is not delivering — which is the failure that
 * actually happened. Measured in the running page: `/browser/frames` open and
 * 200, the host pushing 1.15MB of PNG in six seconds, an `EventSource` opened
 * by hand in the same tab receiving seven frames — and the card on the "no
 * picture" placeholder for the whole errand. A stream stamped with a key from
 * before a restart, or opened on a wire that has since been torn down, does
 * not raise `onerror`; it simply never speaks. So quiet is the symptom and
 * quiet is the trigger, and it costs a healthy stream one comparison a tick.
 */
export function watchFrames(wire: Wire): void {
  streamFrames(wire);
  repeat(wire, FRAME_INTERVAL_MS, async () => {
    if (Date.now() - wire.painted < STREAM_QUIET_MS) return;
    await readFrame(wire);
  });
}

function emitCapture(wire: Wire, capture: ParsedCapture | null): void {
  if (capture === null) return;
  wire.painted = Date.now();
  wire.emit(
    capture.kind === "frame"
      ? { kind: "frame", frame: capture.frame }
      : { kind: "blackout", blackout: capture.blackout },
  );
}
