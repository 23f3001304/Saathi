import { CAST_SETTINGS } from "@covenant/browser-drive";
import type {
  CastFrame,
  LiveCast,
  ScreencastGuard,
} from "@covenant/browser-drive";
import type { Logger } from "@covenant/domain";

import { lookCast } from "./browser-look.js";
import type { BrowserService } from "./browser-service.js";
import type { FeedCounts, Feed, FrameSink } from "./frame-sink.js";
import { emit, newFeed, offer } from "./frame-sink.js";
import { release } from "./frame-pacing.js";
import { startPolling, stopPolling, tick } from "./frame-shutter.js";

export { POLL_INTERVAL_MS } from "./frame-sink.js";
export { TARGET_FPS } from "./frame-pacing.js";
export type { FeedCounts, FrameSink } from "./frame-sink.js";

/** Three attempts, then the shutter has this stream for good. */
const MAX_CAST_FAILURES = 3;

async function stopCast(feed: Feed, why: string): Promise<void> {
  const cast = feed.cast;
  feed.cast = null;
  if (cast === null) return;
  feed.logger.info("browser.cast.stopped", { why });
  await cast.caster.stop().catch(() => undefined);
}

async function judge(
  feed: Feed,
  guard: ScreencastGuard,
  raw: CastFrame,
): Promise<void> {
  const verdict = await guard.judge(raw);
  if (verdict.kind === "frame") {
    offer(feed, verdict);
    return;
  }
  // Both remaining verdicts drop this frame and hand the window back to the
  // shutter: a blackout because no picture may be taken at all, a repaint
  // because these bytes are JPEG and painting a box on one is not something
  // this process can do without a decoder it deliberately does not have.
  if (verdict.kind === "blackout") emit(feed, verdict);
  await stopCast(feed, verdict.kind);
  startPolling(feed);
}

/**
 * One frame, judged and then acknowledged. The ack is last on every branch on
 * purpose: Chrome holds only a few unacknowledged frames before it stops
 * producing, so acknowledging after this process has finished makes the
 * browser itself the thing that waits. Nothing queues here.
 */
async function onFrame(
  feed: Feed,
  cast: LiveCast,
  raw: CastFrame,
): Promise<void> {
  if (feed.busy || feed.stopped) {
    feed.counts.dropped += 1;
    await release(feed, cast, raw.ack);
    return;
  }
  const running = feed.cast;
  feed.busy = true;
  try {
    await judge(feed, cast.guard, raw);
  } catch (cause) {
    feed.logger.warn("browser.cast.frame_failed", {
      cause: String(cause).slice(0, 200),
    });
    await stopCast(feed, "a frame could not be judged");
    startPolling(feed);
  } finally {
    // Released before `busy` clears, so a frame arriving mid-wait is dropped
    // rather than processed — the same "skip to the latest" the sink does. A
    // cast this turn stopped is owed nothing: Chrome is not producing for it.
    if (feed.cast !== null || running === null) {
      await release(feed, cast, raw.ack);
    }
    feed.busy = false;
  }
}

async function startCast(feed: Feed): Promise<void> {
  if (feed.stopped || feed.cast !== null || feed.starting) return;
  if (feed.castFailures >= MAX_CAST_FAILURES) return;
  const cast = lookCast(feed.service.current());
  if (cast === null) return;
  feed.starting = true;
  try {
    await cast.guard.prime();
    await cast.caster.start(
      CAST_SETTINGS,
      (raw) => void onFrame(feed, cast, raw),
    );
    feed.cast = cast;
    stopPolling(feed);
    feed.logger.info("browser.cast.started", { ...CAST_SETTINGS });
  } catch (cause) {
    feed.castFailures += 1;
    feed.logger.warn("browser.cast.unavailable", {
      cause: String(cause).slice(0, 200),
      attempt: feed.castFailures,
    });
    startPolling(feed);
  } finally {
    feed.starting = false;
  }
}

/**
 * The frame feed: a screencast where Chrome will give one, the polled shutter
 * where it will not, and a deliberate move between the two whenever the page
 * has something that must be painted out.
 *
 * DECISION: the shutter starts first and the cast is asked for afterwards. A
 * screencast only produces a frame when the page changes, so a card opened on
 * a page that is sitting still would stay blank until something moved; one
 * shutter frame makes the window visible at once and the cast keeps it moving.
 */
export function startFeed(
  service: BrowserService,
  sink: FrameSink,
  logger: Logger,
): { stop: () => void; counts: FeedCounts } {
  const feed = newFeed(service, sink, logger);
  feed.climb = () => void startCast(feed);
  void tick(feed).then(() => startCast(feed));
  startPolling(feed);
  return {
    counts: feed.counts,
    stop: () => {
      feed.stopped = true;
      stopPolling(feed);
      void stopCast(feed, "the subscriber went away");
    },
  };
}
