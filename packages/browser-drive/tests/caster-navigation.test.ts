import { describe, expect, it } from "vitest";

import { MainFrameNavigations } from "../src/chrome/main-frame-navigations.js";
import { PuppeteerCaster } from "../src/chrome/puppeteer-caster.js";
import { PuppeteerPage } from "../src/chrome/puppeteer-page.js";
import type { CastSettings } from "../src/ports.js";
import { FakeCastPage, settle } from "./fake-cast-page.js";

const SETTINGS: CastSettings = {
  format: "png",
  quality: 80,
  maxWidth: 1280,
  maxHeight: 900,
  everyNthFrame: 1,
};

async function counting(page: FakeCastPage): Promise<MainFrameNavigations> {
  const navigations = new MainFrameNavigations();
  await navigations.follow(page.page);
  return navigations;
}

/**
 * Which page a frame is a picture of, decided where the answer is still
 * knowable. Downstream, every frame looks alike: bytes, a size and an ack. The
 * one thing that separates a picture of the page the shopper is on from a
 * picture of the page it left is which screencast session produced it, and
 * that is only visible here.
 */
describe("the cast follows the page's current target", () => {
  it("stamps a frame with the navigation its session was opened under", async () => {
    const page = new FakeCastPage();
    const caster = new PuppeteerCaster(page.page, await counting(page));
    const frames: number[] = [];
    await caster.start(SETTINGS, (frame) => frames.push(frame.navigation));

    page.casts()[0]?.pushFrame(1);
    page.navigate();
    await settle();
    // Chrome does not stop mid-sentence: a session that has been detached can
    // still have frames of the old document in the pipe, and they arrive.
    page.casts()[0]?.pushFrame(1);
    page.casts()[1]?.pushFrame(1);

    expect(frames).toEqual([0, 1]);
    await caster.stop();
  });

  it("counts only the main frame, so an ad iframe is not a navigation", async () => {
    const page = new FakeCastPage();
    const navigations = await counting(page);
    page.navigateSubFrame();
    page.navigateSubFrame();
    expect(navigations.current()).toBe(0);
    page.navigate();
    expect(navigations.current()).toBe(1);
  });
});

/**
 * The shop that pushStates per search, per filter, per scroll — which is every
 * real one. Puppeteer's page-level `framenavigated` fires for those exactly as
 * it does for a document commit, so a counter that listened there called the
 * running cast out of date on the pages the shopper uses most.
 */
describe("a navigation inside the same document", () => {
  it("is not counted as a document commit", async () => {
    const page = new FakeCastPage();
    const navigations = await counting(page);
    page.navigate();
    page.navigateWithinDocument();
    page.navigateWithinDocument();
    expect(navigations.current()).toBe(1);
  });

  it("keeps serving frames across a pushState", async () => {
    const page = new FakeCastPage();
    const caster = new PuppeteerCaster(page.page, await counting(page));
    const frames: number[] = [];
    await caster.start(SETTINGS, (frame) => frames.push(frame.navigation));

    page.navigate();
    await settle();
    page.navigateWithinDocument();
    await settle();
    page.casts().at(-1)?.pushFrame(1);

    // Stamped 1, not 2: the document did not change, so the frames the cast is
    // producing are still frames of the page the shopper is looking at.
    expect(frames).toEqual([1]);
    await caster.stop();
  });
});

/**
 * Chrome retires the page handle under a long session — a cross-process
 * navigation, a target swap — and `PuppeteerPage.live()` re-resolves it. The
 * counter and the cast were both built from the handle taken at launch, so
 * without being moved with it the count freezes on a constant, every capture
 * compares equal to it, and the whole stamp quietly stops meaning anything on
 * the one surface it was written for.
 */
describe("the window moves to another target", () => {
  it("keeps counting there and casts from it", async () => {
    const first = new FakeCastPage("first");
    const second = new FakeCastPage("second");
    first.peers.push(second);
    const driven = await PuppeteerPage.open(first.page);
    const frames: number[] = [];
    await driven
      .caster()
      .start(SETTINGS, (frame) => frames.push(frame.navigation));

    first.casts()[0]?.pushFrame(1);
    first.navigate();
    expect(driven.navigations()).toBe(1);
    first.failNext = new Error("Attempted to use detached Frame 'D31'.");
    await driven.snapshotFields();

    // The move is itself a change of document, so the count steps rather than
    // resetting: a frame from the retired target must come out older.
    expect(driven.navigations()).toBe(2);
    second.navigate();
    expect(driven.navigations()).toBe(3);
    first.navigate();
    expect(driven.navigations()).toBe(3);

    // The retired target is still there and still willing to talk; nothing it
    // says is served, and the target the window is actually on is.
    first.casts().at(-1)?.pushFrame(1);
    second.casts().at(-1)?.pushFrame(1);
    expect(frames).toEqual([0, 2]);
    await driven.caster().stop();
  });
});
