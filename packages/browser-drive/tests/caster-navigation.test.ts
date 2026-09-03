import { describe, expect, it } from "vitest";

import { MainFrameNavigations } from "../src/chrome/main-frame-navigations.js";
import { PuppeteerCaster } from "../src/chrome/puppeteer-caster.js";
import type { CastSettings } from "../src/ports.js";
import { fakePage } from "./fake-caster.js";

const SETTINGS: CastSettings = {
  format: "png",
  quality: 80,
  maxWidth: 1280,
  maxHeight: 900,
  everyNthFrame: 1,
};

/**
 * Which page a frame is a picture of, decided where the answer is still
 * knowable. Downstream, every frame looks alike: bytes, a size and an ack. The
 * one thing that separates a picture of the page the shopper is on from a
 * picture of the page it left is which screencast session produced it, and
 * that is only visible here.
 */
describe("the cast follows the page's current target", () => {
  it("stamps a frame with the navigation its session was opened under", async () => {
    const page = fakePage();
    const caster = new PuppeteerCaster(
      page.page,
      new MainFrameNavigations(page.page),
    );
    const frames: number[] = [];
    await caster.start(SETTINGS, (frame) => frames.push(frame.navigation));

    page.emitFrame(0);
    page.navigate();
    await page.settle();
    // Chrome does not stop mid-sentence: a session that has been detached can
    // still have frames of the old document in the pipe, and they arrive.
    page.emitFrame(0);
    page.emitFrame(1);

    expect(frames).toEqual([0, 1]);
    await caster.stop();
  });

  it("counts only the main frame, so an ad iframe is not a navigation", () => {
    const page = fakePage();
    const navigations = new MainFrameNavigations(page.page);
    page.navigateSubFrame();
    page.navigateSubFrame();
    expect(navigations.current()).toBe(0);
    page.navigate();
    expect(navigations.current()).toBe(1);
  });
});
