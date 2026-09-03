import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dockerSandboxReady } from "../src/container/docker-cli.js";
import { fixtureShopUrl } from "../src/fixtures.js";
import { decodePng } from "../src/frame/png.js";
import type { CastFrame, CastSettings } from "../src/ports.js";
import type { BrowserSession } from "../src/session/browser-session.js";
import { buildContainerSession, IMAGE, LAUNCH_MS } from "./container-rig.js";

const SKIP_REASON = await dockerSandboxReady(IMAGE);
if (SKIP_REASON !== null) {
  console.warn(`[browser-drive] cast-navigation suite SKIPPED: ${SKIP_REASON}`);
}

/**
 * PNG rather than the shipping JPEG, because this suite has to answer "which
 * page are these pixels of?" and this package carries a PNG decoder and no
 * JPEG one. The path under test is the same either way: the caster does not
 * know which format it is forwarding.
 */
const PNG_CAST: CastSettings = {
  format: "png",
  quality: 80,
  maxWidth: 1280,
  maxHeight: 900,
  everyNthFrame: 1,
};

/** The two full-bleed fixtures, by the corner colour each one floods. */
const CORNER = 50;
type Shade = "A" | "B" | "other";

function shadeOf(bytes: Uint8Array): Shade {
  const image = decodePng(bytes);
  const wide = Math.min(CORNER, image.width);
  const tall = Math.min(CORNER, image.height);
  let red = 0;
  let blue = 0;
  for (let y = 0; y < tall; y += 1) {
    for (let x = 0; x < wide; x += 1) {
      const at = (y * image.width + x) * 4;
      red += image.pixels[at] ?? 0;
      blue += image.pixels[at + 2] ?? 0;
    }
  }
  const count = wide * tall;
  return nearest(red / count, blue / count);
}

/** `other` is a real answer, not a failure: a document that has committed but
 *  not painted is neither page, and the assertions below are about A and B. */
function nearest(red: number, blue: number): Shade {
  if (red > 120 && blue < 90) return "A";
  if (blue > 120 && red < 90) return "B";
  return "other";
}

/** One frame: the page the session said it was on, what the pixels show,
 *  whether the URL had already been rewritten by `pushState`, and whether the
 *  host would have served it. */
interface Shot {
  readonly page: Shade;
  readonly shade: Shade;
  readonly filtered: boolean;
  readonly stale: boolean;
}

const shots: Shot[] = [];
let session: BrowserSession;

function pageOf(url: string): Shade {
  if (url.includes("cast-a.html")) return "A";
  if (url.includes("cast-b.html")) return "B";
  return "other";
}

function served(page: Shade, shade: Shade): number {
  return shots.filter(
    (shot) => !shot.stale && shot.page === page && shot.shade === shade,
  ).length;
}

/**
 * Every frame is acknowledged whatever else happens to it: Chrome holds only a
 * few unacked frames and then stops producing, and a stream that stops proves
 * nothing here. That is also why the caster forwards a frame it can already
 * tell is stale rather than swallowing it — the ack is the caller's.
 *
 * The staleness rule is the host's, in `frame-sink.ts`, restated rather than
 * imported: this package may not depend on the app that runs it. What is being
 * proved is not the comparison, which is one line, but that the stamp Chrome's
 * own frames arrive with actually separates one page's pixels from the other's.
 */
async function startCollecting(): Promise<void> {
  const cast = session.screencast();
  if (cast === null) throw new Error("the container surface has no caster");
  await cast.caster.start(PNG_CAST, (frame: CastFrame) => {
    const url = session.url();
    shots.push({
      page: pageOf(url),
      shade: shadeOf(frame.bytes),
      filtered: url.includes("?filtered"),
      stale: frame.navigation < session.navigations(),
    });
    void cast.caster.ack(frame.ack).catch(() => undefined);
  });
}

async function settle(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Twice through, because the frame that exposes the bug is one Chrome
 *  happens to deliver in the few milliseconds between the commit and the
 *  reattach, and whether it does is a race with its own compositor. */
const WALK = ["cast-b.html", "cast-a.html", "cast-b.html"];

beforeAll(async () => {
  if (SKIP_REASON !== null) return;
  // Its own container name: this suite runs beside the other container suites
  // in the package run, and two of them cannot share one.
  session = buildContainerSession("web_ctrcast");
  const page = await session.launch();
  await page.navigate(fixtureShopUrl("cast-a.html", "container"));
  await startCollecting();
  await settle(800);
  for (const to of WALK) {
    await page.navigate(fixtureShopUrl(to, "container"));
    await settle(800);
  }
  await session.screencast()?.caster.stop();
}, LAUNCH_MS);

afterAll(async () => {
  if (SKIP_REASON !== null) return;
  await session.close();
}, LAUNCH_MS);

const container = describe.skipIf(SKIP_REASON !== null);

/**
 * The founder's bug, in the surface it happened on: the sandbox navigated and
 * the live view kept painting the page it had left. Real Docker, real Chrome,
 * two full-bleed fixtures baked into the image — so "which page is this a
 * frame of?" is decided by the pixels rather than by anything this process
 * believes about them.
 *
 * The pairing is the whole assertion. Each frame is filed under the URL the
 * session reported while that frame was being handed on, which is the same
 * pair the wire carries: the payload's `url` is read when the frame is sent.
 * A frame of A filed under B is precisely what the shopper saw — moglix's
 * pixels under amazon.in's address bar.
 */
container("the cast after a navigation", () => {
  it("was watching a page that kept painting", () => {
    expect(served("A", "A")).toBeGreaterThan(1);
  });

  it("serves no frame of the page it left", () => {
    expect(served("B", "B")).toBeGreaterThan(0);
    expect(served("B", "A")).toBe(0);
    expect(served("A", "B")).toBe(0);
  });

  /**
   * The implication, not the race. Whether Chrome hands one of the old
   * document's frames over in the window between the commit and the reattach
   * is its own compositor's business and this suite cannot make it happen;
   * what it can insist on is that every one it does hand over was recognised.
   * The run that found this bug caught one three milliseconds after the
   * commit.
   */
  it("recognised every frame of a page the window had left", () => {
    const wrong = shots.filter(
      (shot) => shot.shade !== "other" && shot.page !== shot.shade,
    );
    expect(wrong.every((shot) => shot.stale)).toBe(true);
  });
});

/**
 * The same window, the same document, a different URL. `cast-b.html` rewrites
 * its own with `history.pushState` shortly after it paints, which is what a
 * real shop does on every search and every filter. Nothing has been left, so
 * the frames the cast is producing are still frames of the page the shopper is
 * looking at — and a live view that read a same-document navigation as a new
 * document would call every one of them stale and paint nothing from here on.
 */
container("the cast after a pushState", () => {
  it("keeps serving the page it is still on", () => {
    const after = shots.filter((shot) => shot.filtered);
    expect(after.length).toBeGreaterThan(0);
    expect(after.filter((shot) => shot.stale).length).toBe(0);
    expect(after.filter((shot) => shot.shade === "B").length).toBeGreaterThan(
      0,
    );
  });
});
