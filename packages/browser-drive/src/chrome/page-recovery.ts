// Recovering a Chrome page handle that Chrome has retired under us. Kept beside
// PuppeteerPage rather than inside it so that file stays a straight
// implementation of `DrivenPage`, and so the one piece of guesswork in the
// package — which page the errand is on now — is readable on its own.
import type { Page } from "puppeteer";

/** Matched on the message because puppeteer throws a plain `Error` for all of
 *  them: there is no type to narrow on. */
const STALE =
  /detached|Target closed|Session closed|Execution context was destroyed/i;

/**
 * A page worth swapping to.
 *
 * DECISION: a page that is open is not the same as a page that works. The
 * recovery picked the newest tab that was not closed, and a *detached* tab is
 * not closed — so a window with two dead frames ping-ponged between them,
 * thirty times in thirty seconds, each swap throwing the same detached error
 * the swap was supposed to escape. The shopper's pane went black and stayed
 * black. Asking the frame whether it is detached costs nothing and ends it.
 */
function usable(page: Page): boolean {
  try {
    if (page.isClosed()) return false;
    const frame = page.mainFrame() as { detached?: boolean };
    return frame.detached !== true;
  } catch {
    return false;
  }
}

const NAV_TIMEOUT_MS = 30_000;

/** What Chrome says when the handle outlived the thing it pointed at. */
export function isStalePage(cause: unknown): boolean {
  return STALE.test(cause instanceof Error ? cause.message : String(cause));
}

/**
 * A page to speak to instead of the retired one.
 *
 * Another open tab is preferred — a site that opened one is usually where the
 * errand now is. When the stale handle is the only tab, picking it again just
 * fails identically (measured: the same frame id in 59,000 consecutive 500s),
 * so the window is rebuilt. The shop's cookies live in the sandbox profile
 * rather than in the tab, so the errand survives the swap; a blind card for
 * the rest of the session does not.
 */
function urlOf(page: Page): string {
  try {
    return page.url();
  } catch {
    return "";
  }
}

export async function freshPage(stale: Page): Promise<Page> {
  const browser = stale.browser();
  const open = await browser.pages();
  const adopted = open.filter((page) => page !== stale && usable(page)).at(-1);
  const next = adopted ?? (await browser.newPage());
  if (adopted === undefined) {
    // A detached page still answers `url()` on some builds and throws on
    // others; either way a rebuild that cannot read it is still a rebuild.
    const url = urlOf(stale);
    if (url !== "" && url !== "about:blank") {
      await next
        .goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS })
        .catch(() => undefined);
    }
  }
  await next.bringToFront().catch(() => undefined);
  return next;
}
