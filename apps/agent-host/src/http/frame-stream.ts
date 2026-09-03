import type { Capture } from "@covenant/browser-drive";
import type { Logger } from "@covenant/domain";

import type { BrowserService } from "../browser/browser-service.js";
import { startFeed, TARGET_FPS } from "../browser/frame-feed.js";
import type { FeedCounts, FrameSink } from "../browser/frame-feed.js";

export { POLL_INTERVAL_MS as FRAME_INTERVAL_MS } from "../browser/frame-feed.js";

/**
 * How much of this subscriber's frames may sit unread before frames start
 * being dropped instead of queued. Roughly a handful at the rates we measure,
 * which bounds the lag a slow client can build to a few hundred milliseconds:
 * a live window that is half a second behind is still a live window, and one
 * that is thirty seconds behind is a recording nobody asked for.
 */
export const CLIENT_BUFFER_BYTES = 512 * 1024;

export interface FramePayload {
  readonly seq: number;
  readonly url: string;
  readonly state: string;
  readonly width: number;
  readonly height: number;
  /** How many boxes were painted out of this frame before it was encoded. */
  readonly redacted: number;
  /**
   * True when these are the browser's own bytes. It is not a reassurance —
   * it is the opposite, and the card can say which path a frame took: the
   * classifier ran either way, and found nothing here it had to paint over.
   */
  readonly passthrough: boolean;
  /** A `data:` URL. JPEG off the screencast, PNG off the shutter. */
  readonly image: string;
}

/**
 * A tick where no picture was taken. It carries no image and no dimensions
 * because there is nothing to carry: the shutter did not open. The UI paints a
 * curtain from this and says why.
 */
export interface BlackoutPayload {
  readonly seq: number;
  readonly url: string;
  readonly state: string;
  readonly blackout: {
    readonly category: string;
    readonly rule: string;
    readonly human: string;
  };
}

export type CapturePayload = FramePayload | BlackoutPayload;

export function payloadOf(
  capture: Capture,
  seq: number,
  url: string,
  state: string,
): CapturePayload {
  if (capture.kind === "blackout") {
    return { seq, url, state, blackout: { ...capture.blackout } };
  }
  const frame = capture.frame;
  return {
    seq,
    url,
    state,
    width: frame.width,
    height: frame.height,
    redacted: frame.redacted,
    passthrough: frame.passthrough,
    image: `data:${frame.mediaType};base64,${Buffer.from(frame.bytes).toString("base64")}`,
  };
}

/**
 * What this stream actually did, beside what it was aiming at. Both, because
 * one without the other is the failure this app keeps having to design
 * against: a ceiling reported as an achievement is a claim nobody checked.
 */
function summary(
  counts: FeedCounts,
  startedAt: number,
): Record<string, number> {
  const seconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
  const sent = counts.fast + counts.slow;
  return {
    fps: Math.round((sent / seconds) * 10) / 10,
    target_fps: TARGET_FPS,
    bytes_per_second: Math.round(counts.bytes / seconds),
    fast: counts.fast,
    slow: counts.slow,
    blackouts: counts.blackouts,
    dropped: counts.dropped,
    stale: counts.stale,
    seconds: Math.round(seconds),
  };
}

interface Wire {
  seq: number;
  stopped: boolean;
}

function sinkOf(
  service: BrowserService,
  controller: ReadableStreamDefaultController<Uint8Array>,
  wire: Wire,
): FrameSink {
  const encoder = new TextEncoder();
  const push = (chunk: string): void => {
    try {
      controller.enqueue(encoder.encode(chunk));
    } catch {
      wire.stopped = true;
    }
  };
  return {
    // `desiredSize` is what this subscriber has left of its buffer. At or
    // below zero it is not keeping up, and the honest thing is to drop the
    // frame: the next one Chrome produces is the current state of the page,
    // so a dropped frame costs freshness and never accumulates a backlog.
    ready: () =>
      !wire.stopped &&
      controller.desiredSize !== null &&
      controller.desiredSize > 0,
    send: (capture: Capture) => {
      const view = service.view();
      if (view === null) return;
      wire.seq += 1;
      const payload = payloadOf(capture, wire.seq, view.url, view.state);
      push(`id: ${wire.seq}\ndata: ${JSON.stringify(payload)}\n\n`);
    },
    closed: () => {
      push(`event: closed\ndata: {}\n\n`);
      wire.stopped = true;
    },
  };
}

/**
 * The frame stream. Read-only by construction: it captures, redacts and
 * publishes, and there is no path from a subscriber back into the window —
 * `POST /browser/input` is a different route with a different guard.
 *
 * An open stream is also the answer to "is anyone watching this container?".
 * `service.watch()` counts it, and the detach on cancel is what lets an
 * abandoned window be noticed and closed rather than idling to its ceiling.
 */
export function frameStream(
  service: BrowserService,
  logger: Logger,
): ReadableStream<Uint8Array> {
  const wire: Wire = { seq: 0, stopped: false };
  let detach: (() => void) | null = null;
  let feed: ReturnType<typeof startFeed> | null = null;
  const startedAt = Date.now();
  return new ReadableStream<Uint8Array>(
    {
      start: (controller) => {
        detach = service.watch();
        feed = startFeed(service, sinkOf(service, controller, wire), logger);
      },
      cancel: () => {
        wire.stopped = true;
        detach?.();
        if (feed !== null) {
          feed.stop();
          logger.info("browser.frames.served", summary(feed.counts, startedAt));
        }
      },
    },
    new ByteLengthQueuingStrategy({ highWaterMark: CLIENT_BUFFER_BYTES }),
  );
}
