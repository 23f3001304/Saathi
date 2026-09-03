import type { Frame, Page } from "puppeteer";

/**
 * How many documents this window's main frame has committed.
 *
 * DECISION: a count rather than a URL or a timestamp, and it exists so that a
 * picture can be asked which page it is a picture of.
 *
 * The failure it answers, measured in the container against two full-bleed
 * fixtures: three milliseconds after the main frame committed the second
 * document, the screencast delivered a frame whose pixels were the *first*
 * page's — Chrome holds the last paint of the document it left until the new
 * one has something to show — and by then `page.url()`, which is what the wire
 * payload is stamped with, already said the second. The shopper saw one shop's
 * pixels under another shop's address bar and clicked on what the picture
 * showed. A URL cannot tell those two apart because both frames are captured
 * under the same one; a wall-clock timestamp cannot either, because the commit
 * and the capture are half a millisecond apart on two different clocks. A
 * monotonic count of commits can: a capture carries the count that was current
 * when the pixels were taken, and anything below the count that is current now
 * is a picture of a page this window has left.
 *
 * Bound to the page for the page's lifetime rather than for the cast's,
 * because the shutter needs the same stamp and takes pictures when no cast is
 * running at all.
 */
export class MainFrameNavigations {
  private committed = 0;

  constructor(page: Page) {
    page.on("framenavigated", (frame: Frame) => {
      // Sub-frames commit constantly on a real shop — an ad iframe is not a
      // navigation of the window, and counting one would throw away every
      // frame captured around it.
      if (frame === page.mainFrame()) this.committed += 1;
    });
  }

  current(): number {
    return this.committed;
  }
}
