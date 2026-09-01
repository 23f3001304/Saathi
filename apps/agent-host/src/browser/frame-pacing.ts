// How fast frames are released, which is a different job from which path is
// producing them. Split out of frame-feed.ts so that file reads as "cast or
// shutter, and when to move between them".
import type { LiveCast } from "@covenant/browser-drive";

import type { Feed } from "./frame-sink.js";

/** Long enough that a healthy ack is never cut short, short enough that a
 *  detached one cannot hold the feed. */
const ACK_TIMEOUT_MS = 2_000;

/**
 * The rate ceiling, applied by holding the acknowledgement rather than by
 * asking Chrome for fewer frames.
 *
 * A ceiling, not a promise. What the stream actually delivers is decided by how
 * often the page changes and by whether the subscriber keeps up, and both are
 * reported: `browser.frames.served` logs the achieved fps beside this number,
 * so a run that managed 22 says 22. A constant claiming a rate the transport
 * did not hold would be the fixture-reel problem in another costume.
 *
 * The cost is real and measured. Unpaced against a page repainting the whole
 * viewport at 60Hz, the cast ran at 60fps and 975 kB/s of flat colour; a
 * text-heavy page's frames measured ~12x larger, so the byte bill scales with
 * content rather than with this number alone. What makes 30 affordable is the
 * fast path: a frame with no sensitive rect on it is forwarded as the browser's
 * own JPEG, never decoded and re-encoded here — 42 of 47 frames on a measured
 * shop run. 30fps of decode-repaint-re-encode would be a different proposition
 * entirely, at ~41ms of pixel work per frame.
 *
 * Pacing costs a quiet page nothing: a frame arriving after the gap has already
 * passed is released immediately.
 */
export const TARGET_FPS = 30;
const MIN_FRAME_GAP_MS = Math.round(1000 / TARGET_FPS);

/**
 * Chrome produces the next frame when this one is acknowledged, so holding the
 * acknowledgement is the cap itself — and every acknowledgement goes through
 * here, a dropped frame's included. Acking a dropped frame immediately would
 * leave Chrome encoding at full rate into a floor, which is the cost the cap
 * exists to avoid; the frame is still dropped, it is just not asked for again
 * any sooner than one we kept.
 *
 * The slot is reserved before the wait, not after, so two frames in flight get
 * successive slots rather than the same one.
 */
/**
 * Bounded, because this runs inside the `finally` that clears `busy`. An ack
 * sent into a just-detached CDP session can neither resolve nor reject, and
 * one that never settles latched `busy` true: every frame and every shutter
 * tick then returned at its guard and the picture never came back for the life
 * of the window, while the action list kept flowing. `repaint` still stops the
 * cast on exactly the pages this happens on.
 */
async function ackWithin(cast: LiveCast, frame: number): Promise<void> {
  await Promise.race([
    cast.caster.ack(frame).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, ACK_TIMEOUT_MS)),
  ]);
}

export async function release(
  feed: Feed,
  cast: LiveCast,
  frame: number,
): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, feed.lastFrameAt + MIN_FRAME_GAP_MS);
  feed.lastFrameAt = at;
  if (at > now) {
    await new Promise((resolve) => setTimeout(resolve, at - now));
  }
  await ackWithin(cast, frame);
}
