// Two research batches can be in flight at once: the reader is one object for
// the whole host and every lane's errand reaches it, with nothing in between
// serialising them. What one batch does to its browser must therefore be
// invisible to the other's - measured here on real headless Chrome, because a
// browser that was closed under a live read fails exactly where a stub would
// not: at `goto`.
import { beforeAll, describe, expect, it } from "vitest";

import { HeadlessReader } from "../src/chrome/headless-reader.js";
import { NativeReaderBrowser } from "../src/chrome/reader-browser.js";
import type { ReaderBrowser } from "../src/chrome/reader-browser.js";
import { NavigationPolicy } from "../src/drive/navigation-policy.js";
import { fixtureShopDir, fixtureShopUrl } from "../src/fixtures.js";

const LAUNCH_MS = 60_000;

/** One native surface, counted. A batch opens its own and closes that one. */
class CountedSurface implements ReaderBrowser {
  opens = 0;
  closes = 0;
  private readonly inner = new NativeReaderBrowser();

  async open(): Promise<Awaited<ReturnType<ReaderBrowser["open"]>>> {
    this.opens += 1;
    return await this.inner.open();
  }

  async close(): Promise<void> {
    this.closes += 1;
    await this.inner.close();
  }
}

let skip: string | null = null;

beforeAll(async () => {
  const probe = new NativeReaderBrowser();
  try {
    await probe.open();
  } catch (cause) {
    skip = String(cause).slice(0, 300);
    console.warn(`[browser-drive] reader batch suite SKIPPED: ${skip}`);
  } finally {
    await probe.close();
  }
}, LAUNCH_MS);

const reader = describe.skipIf(skip !== null);

reader("two research batches at once", () => {
  it(
    "give each batch its own browser and close only that one",
    async () => {
      const made: CountedSurface[] = [];
      const held = new HeadlessReader(
        new NavigationPolicy({
          fileRoots: [fixtureShopDir()],
          allowHosts: [],
          denyHosts: [],
        }),
        () => {
          const surface = new CountedSurface();
          made.push(surface);
          return surface;
        },
      );
      const shop = [fixtureShopUrl("index.html")];
      const [first, second] = await Promise.all([
        held.readMany(shop),
        held.readMany(shop),
      ]);
      expect(first[0]?.failure).toBeNull();
      expect(second[0]?.failure).toBeNull();
      expect(first[0]?.text).toContain("Trailfoot");
      expect(second[0]?.text).toContain("Trailfoot");
      expect(made).toHaveLength(2);
      expect(made.map((surface) => [surface.opens, surface.closes])).toEqual([
        [1, 1],
        [1, 1],
      ]);
    },
    LAUNCH_MS,
  );
});
