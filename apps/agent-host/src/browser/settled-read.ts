import type { BrowserSession, PageDom, Waiter } from "@covenant/browser-drive";

/** Long enough for a search to commit its navigation, short enough to feel
 *  like the page simply loaded. */
export const SETTLE_MS = 1_200;

/**
 * How long a page gets to be read before the read is abandoned.
 *
 * DECISION: a bound, because there was none and a real page found the gap. The
 * research phase opens product pages rather than only search results, and an
 * Amazon product page's `readPage()` can simply never return — infinite
 * lazy-loaded media, an evaluate that never resolves. A live errand sat inside
 * one for over ten minutes: no model call in flight, no browser event, and
 * `ChatService` queueing every later sentence behind a run that would never
 * end. A hung read is indistinguishable, from the outside, from an agent
 * thinking; the only honest thing to do is give up on it and say so.
 *
 * Generous on purpose. This is not a latency budget — a page that takes twenty
 * seconds is a slow page, and abandoning it early would lose readings the
 * errand can actually use. It is the line past which the page is not loading,
 * it is not coming.
 */
export const READ_CEILING_MS = 25_000;

export class PageReadTimeout extends Error {
  constructor(readonly afterMs: number) {
    super(`the page did not finish rendering within ${afterMs}ms`);
    this.name = "PageReadTimeout";
  }
}

/**
 * The read, or the ceiling, whichever lands first.
 *
 * DECISION: a real timer, not the injected `Waiter`. The waiter is the seam
 * for waits this code *chooses* — settling after a navigation — and a fake one
 * resolves instantly, which is exactly right for those and exactly wrong for a
 * watchdog: measured in fake time, every read in the suite would time out
 * before it returned. A watchdog that a test can skip past is not a watchdog.
 *
 * The abandoned read is left to settle on its own; there is no way to cancel a
 * puppeteer evaluate, and awaiting it is the thing being avoided. `unref` so a
 * pending ceiling is never the reason this process stays up.
 */
function within(read: Promise<PageDom>, ms: number): Promise<PageDom> {
  return new Promise<PageDom>((resolve, reject) => {
    const ceiling = setTimeout(() => {
      reject(new PageReadTimeout(ms));
    }, ms);
    ceiling.unref?.();
    read.then(
      (dom) => {
        clearTimeout(ceiling);
        resolve(dom);
      },
      (cause: unknown) => {
        clearTimeout(ceiling);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
  });
}

/**
 * Reading a page that may still be moving.
 *
 * Submitting a search navigates, and puppeteer tears the execution context
 * down under the read that follows — "Execution context was destroyed, most
 * likely because of a navigation", thrown on a real Amazon search and on
 * Amazon's own landing redirect. Waiting and reading again lands on the page
 * the navigation went to, which is the page the agent asked for.
 *
 * `first` is the wait *before* the first attempt, for the calls that know they
 * just caused a navigation. A plain read pays nothing until it has to.
 *
 * Both attempts are bounded. A second failure throws, and `WebShopper.attempt`
 * turns it into an ordinary `page_moved` tool result — so the model learns the
 * page could not be read and goes somewhere else, which is what it would do
 * about any other page that refused to be read.
 */
export async function settledRead(
  session: BrowserSession,
  waiter: Waiter,
  first = 0,
  /** Overridden only so a test can prove the ceiling without waiting out a
   *  real one; production never passes it. */
  ceilingMs: number = READ_CEILING_MS,
): Promise<PageDom> {
  if (first > 0) {
    await waiter.sleep(first);
  }
  try {
    return await within(session.page().readPage(), ceilingMs);
  } catch {
    await waiter.sleep(SETTLE_MS);
    return await within(session.page().readPage(), ceilingMs);
  }
}
