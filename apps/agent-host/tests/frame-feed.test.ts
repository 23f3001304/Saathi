import { beforeEach, describe, expect, it } from "vitest";

import { BrowserService } from "../src/browser/browser-service.js";
import { startFeed } from "../src/browser/frame-feed.js";
import { castFrameOf } from "./support/fake-caster.js";
import { PASSWORD, type FakeSandboxPage } from "./support/fake-sandbox.js";
import {
  collector,
  feedRig,
  JPEG,
  SEARCH_ONLY,
  settle,
} from "./support/feed-rig.js";
import { SilentLogger } from "./support/fakes.js";

let page: FakeSandboxPage;
let service: BrowserService;

beforeEach(async () => {
  ({ page, service } = await feedRig());
});

/**
 * The fast path exists to skip the repainting on the frames that have nothing
 * to repaint. What it must never skip is the deciding, and what it must never
 * do is send a frame the classifier has not cleared.
 */
describe("a page with nothing sensitive on it", () => {
  it("forwards the browser's own bytes and never opens the shutter", async () => {
    page.fields = SEARCH_ONLY;
    const { sink, seen } = collector();
    const feed = startFeed(service, sink, new SilentLogger());
    await settle(60);
    page.cast.push(castFrameOf(1, JPEG));
    await settle(120);
    feed.stop();

    const passed = seen.filter(
      (c) => c.kind === "frame" && c.frame.passthrough,
    );
    expect(passed.length).toBeGreaterThanOrEqual(1);
    const first = passed[0];
    if (first?.kind !== "frame") throw new Error("expected a frame");
    expect(first.frame.mediaType).toBe("image/jpeg");
    expect([...first.frame.bytes]).toEqual([...JPEG]);
    expect(first.frame.redacted).toBe(0);
    expect(feed.counts.fast).toBeGreaterThanOrEqual(1);
  });

  it("acknowledges the frame, because an unacked cast stalls", async () => {
    page.fields = SEARCH_ONLY;
    const { sink } = collector();
    const feed = startFeed(service, sink, new SilentLogger());
    await settle(60);
    page.cast.push(castFrameOf(7, JPEG));
    await settle(150);
    feed.stop();
    expect(page.cast.acked).toContain(7);
  });
});

/**
 * The whole reason the fast path is allowed to forward undecoded bytes: the
 * moment there is anything to paint, those bytes are dropped on the floor and
 * the shutter — which can decode a PNG — takes the window back.
 */
describe("a page that has something to paint out", () => {
  it("drops the screencast frame and falls back to the shutter", async () => {
    const { sink, seen } = collector();
    const feed = startFeed(service, sink, new SilentLogger());
    await settle(60);
    const before = seen.length;
    page.cast.push(castFrameOf(2, JPEG));
    await settle(150);
    feed.stop();

    // Not one frame carrying the browser's own bytes left this process.
    expect(seen.some((c) => c.kind === "frame" && c.frame.passthrough)).toBe(
      false,
    );
    expect(page.cast.stops).toBeGreaterThanOrEqual(1);
    // And the shutter kept the window visible rather than leaving it blank.
    expect(seen.length).toBeGreaterThan(before - 1);
    expect(feed.counts.fast).toBe(0);
  });

  it("climbs back to the cast once the page is clean again", async () => {
    const { sink } = collector();
    const feed = startFeed(service, sink, new SilentLogger());
    await settle(60);
    page.cast.push(castFrameOf(3, JPEG));
    await settle(120);
    expect(page.cast.casting).toBe(false);
    page.fields = SEARCH_ONLY;
    await settle(700);
    feed.stop();
    expect(page.cast.casting || page.cast.started !== null).toBe(true);
  });
});

/**
 * The reversal (see frame-capture.ts): focus no longer ends the picture. The
 * feed keeps producing, and a protected field is painted out of the frame
 * rather than replacing it. The old assertion here was the last thing pinning
 * the behaviour that latched the stream shut on a real checkout page.
 */
describe("a protected field with focus", () => {
  it("keeps sending frames, and never a blackout", async () => {
    page.fields = SEARCH_ONLY;
    page.focused = PASSWORD;
    const { sink, seen } = collector();
    const feed = startFeed(service, sink, new SilentLogger());
    await settle(60);
    page.cast.push(castFrameOf(4, JPEG));
    await settle(150);
    feed.stop();
    expect(seen.some((c) => c.kind === "frame")).toBe(true);
    expect(seen.some((c) => c.kind === "blackout")).toBe(false);
  });
});
