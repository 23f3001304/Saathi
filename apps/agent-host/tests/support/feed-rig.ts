import type { Capture } from "@covenant/browser-drive";

import { BrowserService } from "../../src/browser/browser-service.js";
import { openFixtureShop } from "../../src/browser/demo-walk.js";
import type { FrameSink } from "../../src/browser/frame-feed.js";
import { fakeSession, FakeSandboxPage, SEARCH } from "./fake-sandbox.js";
import { SilentLogger, StepClock } from "./fakes.js";

/** Stands in for the browser's own JPEG; the fast path must not decode it. */
export const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]);

/** A page the redactor has nothing to paint on, so the fast path runs. */
export const SEARCH_ONLY = [
  { descriptor: SEARCH, rect: { x: 5, y: 5, width: 40, height: 12 } },
];

export function collector(ready = (): boolean => true) {
  const seen: Capture[] = [];
  const sink: FrameSink = {
    ready,
    send: (capture) => {
      seen.push(capture);
    },
    closed: () => undefined,
  };
  return { sink, seen };
}

export function settle(ms = 30): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function feedRig(): Promise<{
  page: FakeSandboxPage;
  service: BrowserService;
}> {
  const page = new FakeSandboxPage();
  const session = fakeSession(page, new StepClock(), "container");
  const service = new BrowserService({
    build: () => Promise.resolve(session),
    ids: { uuid: () => "feed" },
    logger: new SilentLogger(),
  });
  await openFixtureShop(service, "index.html", false, new SilentLogger());
  return { page, service };
}
