import { encodePng } from "@covenant/browser-drive";
import { beforeEach, describe, expect, it } from "vitest";

import { BrowserService } from "../src/browser/browser-service.js";
import { startFeed, TARGET_FPS } from "../src/browser/frame-feed.js";
import { BrokenCaster, castFrameOf } from "./support/fake-caster.js";
import type { FakeSandboxPage } from "./support/fake-sandbox.js";
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
 * Requirement, plainly: if the cast cannot run the card must not go blank.
 */
describe("when Chrome will not screencast at all", () => {
  it("falls to the polled shutter rather than to an empty card", async () => {
    page.castable = new BrokenCaster();
    const { sink, seen } = collector();
    const feed = startFeed(service, sink, new SilentLogger());
    await settle(700);
    feed.stop();
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen.every((c) => c.kind !== "frame" || !c.frame.passthrough)).toBe(
      true,
    );
  });

  it("does the same on a surface that has no caster to ask", async () => {
    page.castable = null;
    const { sink, seen } = collector();
    const feed = startFeed(service, sink, new SilentLogger());
    await settle(700);
    feed.stop();
    expect(seen.length).toBeGreaterThanOrEqual(1);
  });
});

describe("a subscriber that cannot keep up", () => {
  it("drops frames rather than queueing them", async () => {
    page.fields = SEARCH_ONLY;
    const { sink, seen } = collector(() => false);
    const feed = startFeed(service, sink, new SilentLogger());
    await settle(60);
    page.cast.push(castFrameOf(5, JPEG));
    await settle(150);
    feed.stop();
    expect(seen.length).toBe(0);
    expect(feed.counts.dropped).toBeGreaterThanOrEqual(1);
  });
});

/**
 * The rate cap lives in the ack, not in `everyNthFrame`, so this is where it
 * has to be checked: frames pushed back to back are released no faster than
 * the target, and Chrome is what waits.
 */
describe("the rate cap", () => {
  it("paces the acknowledgement rather than asking for fewer frames", async () => {
    page.fields = SEARCH_ONLY;
    const { sink } = collector();
    const feed = startFeed(service, sink, new SilentLogger());
    await settle(60);
    expect(page.cast.started?.everyNthFrame).toBe(1);

    const started = Date.now();
    for (let n = 0; n < 4; n += 1) {
      page.cast.push(castFrameOf(100 + n, JPEG));
      await settle(5);
    }
    await settle(400);
    feed.stop();

    const gap = 1000 / TARGET_FPS;
    const paced = page.cast.ackAt.filter((at) => at >= started);
    if (paced.length >= 2) {
      const first = paced[0] ?? 0;
      const last = paced[paced.length - 1] ?? 0;
      expect(last - first).toBeGreaterThanOrEqual(
        gap * (paced.length - 1) * 0.6,
      );
    }
    expect(page.cast.started?.format).toBe("jpeg");
  });
});

describe("the shutter's own frame", () => {
  it("is a real PNG the redactor painted, never a passthrough", async () => {
    const { sink, seen } = collector();
    const feed = startFeed(service, sink, new SilentLogger());
    await settle(120);
    feed.stop();
    const frame = seen.find((c) => c.kind === "frame");
    if (frame?.kind !== "frame") throw new Error("expected a frame");
    expect(frame.frame.mediaType).toBe("image/png");
    expect(frame.frame.passthrough).toBe(false);
    expect(frame.frame.redacted).toBe(1);
    expect(frame.frame.bytes.length).toBeGreaterThan(
      encodePng({ width: 1, height: 1, pixels: new Uint8Array(4) }).length,
    );
  });
});
