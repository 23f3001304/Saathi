// The failure this exists for, measured on the running host: after the agent
// had been driving amazon.in for a few minutes, `/browser/state` still answered
// 200 with `agent-drive` on a real search URL — because `url()` is a cached
// getter — while `/browser/frame` and `/browser/fields` had returned 500 fifty-
// nine thousand consecutive times with "Attempted to use detached Frame", the
// same frame id every time. Everything that reaches into the page goes through
// `evaluate`, and the handle taken at launch had been retired by Chrome. The
// card looked completely alive and could not show one pixel, and no reload of
// the shopper's tab could help, because nothing was wrong in their tab.
import { describe, expect, it } from "vitest";

import type { Page } from "puppeteer";

import { freshPage, isStalePage } from "../src/chrome/page-recovery.js";

const DETACHED = new Error(
  "Attempted to use detached Frame 'D31398E7DFAB084E6A5031645C60F03D'.",
);

interface FakePage {
  closed: boolean;
  /** A tab can be open and still be dead: its main frame detached. */
  detached: boolean;
  fronted: number;
  goneTo: string[];
  url: () => string;
}

function fake(url = "https://www.amazon.in/s?k=ssd"): FakePage & Page {
  const page = {
    closed: false,
    detached: false,
    fronted: 0,
    goneTo: [] as string[],
    url: () => url,
    isClosed: () => page.closed,
    mainFrame: () => ({ detached: page.detached }),
    bringToFront: async () => {
      page.fronted += 1;
    },
    goto: async (to: string) => {
      page.goneTo.push(to);
      return null;
    },
  };
  return page as unknown as FakePage & Page;
}

/** A browser holding exactly the pages it is given, plus whatever is opened. */
function browserOf(
  pages: (FakePage & Page)[],
): (page: FakePage & Page) => void {
  const made: (FakePage & Page)[] = [];
  return (page) => {
    Object.assign(page, {
      browser: () => ({
        pages: async () => [...pages, ...made],
        newPage: async () => {
          const born = fake("about:blank");
          browserOf(pages)(born);
          made.push(born);
          return born;
        },
      }),
    });
  };
}

describe("telling a retired handle from a real failure", () => {
  it("knows the sentence Chrome uses", () => {
    expect(isStalePage(DETACHED)).toBe(true);
    expect(isStalePage(new Error("Target closed"))).toBe(true);
    expect(isStalePage(new Error("Execution context was destroyed"))).toBe(
      true,
    );
  });

  /** A retry that swallowed everything would hide real page errors behind a
   *  second attempt at the same broken thing. */
  it("leaves an ordinary failure alone", () => {
    expect(isStalePage(new Error("Node is not visible"))).toBe(false);
    expect(isStalePage(new Error("net::ERR_NAME_NOT_RESOLVED"))).toBe(false);
  });
});

describe("finding a page to speak to instead", () => {
  it("adopts another open tab, where the site opened one", async () => {
    const stale = fake();
    const other = fake("https://www.amazon.in/dp/B0BHJF2VRN");
    browserOf([stale, other])(stale);

    const next = await freshPage(stale);
    expect(next).toBe(other);
    expect((next as unknown as FakePage).fronted).toBe(1);
    // Nothing was rebuilt: the errand is already on that tab.
    expect((next as unknown as FakePage).goneTo).toEqual([]);
  });

  /**
   * The measured case. Re-picking the only tab is what made the first attempt
   * at this fix useless — it failed identically, forever. The profile holds
   * the shop's cookies, so a new tab at the same URL is the same errand.
   */
  it("rebuilds the window when the retired tab is the only one", async () => {
    const stale = fake();
    browserOf([stale])(stale);

    const next = await freshPage(stale);
    expect(next).not.toBe(stale);
    expect((next as unknown as FakePage).goneTo).toEqual([
      "https://www.amazon.in/s?k=ssd",
    ]);
    expect((next as unknown as FakePage).fronted).toBe(1);
  });
});

describe("rebuilding, in the cases that need care", () => {
  it("does not navigate a rebuilt tab to a blank page", async () => {
    const stale = fake("about:blank");
    browserOf([stale])(stale);

    expect((await freshPage(stale)).url()).toBe("about:blank");
  });

  it("ignores a tab that has been closed", async () => {
    const stale = fake();
    const shut = fake("https://www.amazon.in/cart");
    shut.closed = true;
    browserOf([stale, shut])(stale);

    const next = await freshPage(stale);
    expect(next).not.toBe(shut);
    expect(next).not.toBe(stale);
  });
});

describe("a tab that is open and dead is not a tab to speak to", () => {
  it("rebuilds rather than adopting a detached frame", async () => {
    // Thirty consecutive failures in thirty seconds, alternating two frame
    // ids: the recovery kept swapping between two detached tabs, each swap
    // throwing the error the swap existed to escape, and the shopper's pane
    // stayed black throughout.
    const stale = fake();
    const dead = fake("https://www.amazon.in/dp/B0CK778YL5");
    dead.detached = true;
    browserOf([stale, dead])(stale);

    const next = (await freshPage(stale)) as FakePage & Page;

    expect(next).not.toBe(dead);
    expect(next).not.toBe(stale);
    expect(next.url()).toBe("about:blank");
  });
});
