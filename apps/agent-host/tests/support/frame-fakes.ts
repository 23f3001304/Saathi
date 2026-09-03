import type { Capture } from "@covenant/browser-drive";
import type { Logger } from "@covenant/domain";

import type { BrowserService } from "../../src/browser/browser-service.js";
import { SilentLogger } from "./fakes.js";

/** Stands in for a PNG the shutter took. The sink never decodes one. */
const PIXELS = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

/**
 * A window that is only ever asked one thing: which document is it on now.
 *
 * The sink's whole judgement is a comparison against that number, so a double
 * that answers it is the whole seam. Building a real `BrowserService` here
 * would drag a launcher, a classifier and a state machine into a test about
 * one integer.
 */
class FakeFeedService {
  readonly logger: Logger = new SilentLogger();

  constructor(private at: number) {}

  navigations(): number {
    return this.at;
  }

  /** The window moves on while a capture is still in flight. */
  arrivesAt(navigation: number): void {
    this.at = navigation;
  }
}

export type FeedService = FakeFeedService & BrowserService;

export function fakeService(at: { navigation: number }): FeedService {
  return new FakeFeedService(at.navigation) as unknown as FeedService;
}

/** One captured frame, stamped with the document it is a picture of. */
export function frameStamped(navigation: number): Capture {
  return {
    kind: "frame",
    frame: {
      bytes: PIXELS,
      mediaType: "image/png",
      width: 320,
      height: 200,
      redacted: 0,
      navigation,
      passthrough: false,
    },
  };
}
