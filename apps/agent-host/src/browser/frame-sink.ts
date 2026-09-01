import type { Capture, LiveCast } from "@covenant/browser-drive";
import type { Logger } from "@covenant/domain";

import type { BrowserService } from "./browser-service.js";

/** The fallback rate, and the rate while a page has anything to paint out. */
export const POLL_INTERVAL_MS = 500;

/**
 * Where a frame goes, and whether it can go there yet.
 *
 * `ready()` is the backpressure. A subscriber that cannot keep up is not
 * queued for: the frame is dropped and the next one Chrome produces is the
 * current state of the page, so dropping is always "skip to the latest" and
 * never "fall behind by a growing amount".
 */
export interface FrameSink {
  ready(): boolean;
  send(capture: Capture): void;
  closed(): void;
}

export interface FeedCounts {
  /** Frames forwarded with the browser's own bytes, nothing repainted. */
  fast: number;
  /** Frames captured and repainted by the polled shutter. */
  slow: number;
  blackouts: number;
  /** Frames produced and not sent: the subscriber was behind, or busy. */
  dropped: number;
  bytes: number;
}

/**
 * Everything one open stream carries.
 *
 * `climb` is how the shutter tells the feed that the window is clean again
 * without importing the thing that starts a cast — the two halves would
 * otherwise refer to each other, and a cycle here is both a lint failure and
 * a real tangle: "how to poll" and "when to stop polling" are not one job.
 */
export interface Feed {
  readonly service: BrowserService;
  readonly sink: FrameSink;
  readonly logger: Logger;
  readonly counts: FeedCounts;
  /** Called on a polled frame with nothing redacted out of it. */
  climb: () => void;
  cast: LiveCast | null;
  /**
   * Set synchronously, because `cast` is only set after an await and both the
   * opening tick and the shutter's climb can ask for a cast in the same turn.
   * Two starts race, the second stops the first, and the window goes quiet.
   */
  starting: boolean;
  /** When the last screencast frame was released, for the rate cap. */
  lastFrameAt: number;
  timer: NodeJS.Timeout | null;
  busy: boolean;
  stopped: boolean;
  /** A cast that will not start is not retried forever. */
  castFailures: number;
}

export function newFeed(
  service: BrowserService,
  sink: FrameSink,
  logger: Logger,
): Feed {
  return {
    service,
    sink,
    logger,
    counts: { fast: 0, slow: 0, blackouts: 0, dropped: 0, bytes: 0 },
    climb: () => undefined,
    cast: null,
    starting: false,
    lastFrameAt: 0,
    timer: null,
    busy: false,
    stopped: false,
    castFailures: 0,
  };
}

/** The one place a frame is counted and handed on, so the split is countable. */
export function emit(feed: Feed, capture: Capture): void {
  if (capture.kind === "blackout") {
    feed.counts.blackouts += 1;
  } else {
    feed.counts.bytes += capture.frame.bytes.length;
    if (capture.frame.passthrough) feed.counts.fast += 1;
    else feed.counts.slow += 1;
  }
  feed.sink.send(capture);
}

/** Dropped rather than queued, and counted so the policy is observable. */
export function offer(feed: Feed, capture: Capture): void {
  if (feed.sink.ready()) emit(feed, capture);
  else feed.counts.dropped += 1;
}
