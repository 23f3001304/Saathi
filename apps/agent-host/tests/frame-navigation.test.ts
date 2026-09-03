import type { Capture } from "@covenant/browser-drive";
import { describe, expect, it } from "vitest";

import type { FrameSink } from "../src/browser/frame-sink.js";
import { emit, newFeed, offer } from "../src/browser/frame-sink.js";
import type { FeedService } from "./support/frame-fakes.js";
import { fakeService, frameStamped } from "./support/frame-fakes.js";

function stampOf(capture: Capture): number {
  return capture.kind === "frame" ? capture.frame.navigation : -1;
}

function feedInto(service: FeedService, ready = (): boolean => true) {
  const sent: number[] = [];
  const sink: FrameSink = {
    ready,
    send: (capture) => sent.push(stampOf(capture)),
    closed: () => undefined,
  };
  return { sent, feed: newFeed(service, sink, service.logger) };
}

/**
 * The founder's report, at the seam that can still do something about it: the
 * live view painted the shop the errand had left while the address bar said
 * the one it was on. The pixels and the URL are stamped at different moments —
 * the pixels when Chrome took them, the URL when the sink sends them — so a
 * frame captured a heartbeat before the navigation goes out describing the
 * page after it. Nothing downstream can tell; here it is one comparison.
 */
describe("a frame from before the navigation is never served", () => {
  it("drops the stale capture and counts it", () => {
    const service = fakeService({ navigation: 2 });
    const { sent, feed } = feedInto(service);

    offer(feed, frameStamped(1));
    offer(feed, frameStamped(2));

    expect(sent).toEqual([2]);
    expect(feed.counts.stale).toBe(1);
  });

  it("tells a stale frame from a subscriber that is behind", () => {
    const service = fakeService({ navigation: 3 });
    const { sent, feed } = feedInto(service, () => false);

    offer(feed, frameStamped(2));
    offer(feed, frameStamped(3));

    expect(sent).toEqual([]);
    expect(feed.counts.stale).toBe(1);
    expect(feed.counts.dropped).toBe(1);
  });
});

/** The same rule at the two doors a capture can come in by, so neither one
 *  can quietly become the exception. */
describe("the rule holds wherever the capture enters", () => {
  it("drops one that reaches the sink without being offered", () => {
    const service = fakeService({ navigation: 1 });
    const { sent, feed } = feedInto(service);

    emit(feed, frameStamped(0));

    expect(sent).toEqual([]);
    expect(feed.counts.stale).toBe(1);
    expect(feed.counts.fast + feed.counts.slow).toBe(0);
  });

  it("serves a capture the window has not moved past", () => {
    const service = fakeService({ navigation: 4 });
    const { sent, feed } = feedInto(service);

    offer(feed, frameStamped(4));
    // The shutter opened on document 4 and the window is still on it.
    service.arrivesAt(5);
    offer(feed, frameStamped(5));

    expect(sent).toEqual([4, 5]);
    expect(feed.counts.stale).toBe(0);
  });
});
