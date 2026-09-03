import type { CDPSession, Page } from "puppeteer";

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
 * DECISION: the CDP event, not puppeteer's `framenavigated`.
 *
 * `FrameManager` emits `FrameNavigated` from `#onFrameNavigatedWithinDocument`
 * as well as from a real commit, and the page-level event carries nothing that
 * separates them — so a `history.pushState` on the main frame looked exactly
 * like a new document. Every real shop pushStates per search, per filter, per
 * scroll; counting those would have stamped the running cast as out of date
 * and thrown away frames that were perfectly correct, turning a live view into
 * a blank one on the pages the shopper uses most. Chrome sends
 * `Page.frameNavigated` only when a document commits and reports a
 * same-document navigation on `Page.navigatedWithinDocument` instead, so
 * listening on the wire is what "a new document" actually means. The loader id
 * is the same fact belt-and-braces: it changes once per document and never
 * within one.
 *
 * Bound to the page for the page's lifetime rather than for the cast's,
 * because the shutter needs the same stamp and takes pictures when no cast is
 * running at all.
 */
export class MainFrameNavigations {
  private committed = 0;
  private loader = "";
  private session: CDPSession | null = null;

  /**
   * Binds to a page's current target, and rebinds when the window moves to
   * another one. The count carries across the move and is stepped by it: the
   * new target is showing a different document, and a frame captured before
   * the move has to come out older than the count is now, or the cast that was
   * running on the retired target would go on being believed.
   */
  async follow(page: Page): Promise<void> {
    const old = this.session;
    this.session = null;
    if (old !== null) {
      this.committed += 1;
      this.loader = "";
      await old.detach().catch(() => undefined);
    }
    const session = await page.createCDPSession();
    this.session = session;
    session.on("Page.frameNavigated", (event) => {
      // No parent is what makes it the main frame; an ad iframe committing a
      // document is not this window going anywhere.
      if (event.frame.parentId !== undefined) return;
      if (event.frame.loaderId === this.loader) return;
      this.loader = event.frame.loaderId;
      this.committed += 1;
    });
    await session.send("Page.enable");
  }

  current(): number {
    return this.committed;
  }
}
