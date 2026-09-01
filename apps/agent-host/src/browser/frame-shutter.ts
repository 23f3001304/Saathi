import type { Feed } from "./frame-sink.js";
import { offer, POLL_INTERVAL_MS } from "./frame-sink.js";

/**
 * The polled path, unchanged from what it always was.
 *
 * It is the fallback when Chrome will not screencast, and it is also where the
 * cast deliberately sends a page that has something to redact: this is the
 * path that can decode a PNG and paint a box on it, which is the whole reason
 * the fast path is allowed to skip the repainting.
 */
export async function tick(feed: Feed): Promise<void> {
  if (feed.stopped || feed.busy) return;
  feed.busy = true;
  try {
    const capture = await feed.service.frame();
    if (capture === null) {
      feed.sink.closed();
      feed.stopped = true;
      return;
    }
    offer(feed, capture);
    // A clean frame means whatever forced the shutter has gone: no protected
    // field has focus, and nothing on the page needs painting out. That is
    // exactly the condition the fast path runs under, so say so.
    if (capture.kind === "frame" && capture.frame.redacted === 0) feed.climb();
  } catch (cause) {
    // A frame that cannot be redacted is a frame that is not sent. The stream
    // stays open and skips this tick rather than shipping raw pixels.
    feed.logger.warn("browser.frame.skipped", {
      cause: String(cause).slice(0, 200),
    });
  } finally {
    feed.busy = false;
  }
}

export function startPolling(feed: Feed): void {
  if (feed.stopped || feed.timer !== null) return;
  feed.timer = setInterval(() => void tick(feed), POLL_INTERVAL_MS);
  feed.timer.unref();
}

export function stopPolling(feed: Feed): void {
  if (feed.timer === null) return;
  clearInterval(feed.timer);
  feed.timer = null;
}
