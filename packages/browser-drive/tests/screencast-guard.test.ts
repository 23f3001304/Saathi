import { describe, expect, it } from "vitest";

import { FieldClassifier } from "../src/field/field-classifier.js";
import { decodePng, encodePng } from "../src/frame/png.js";
import { paintRects, REDACTION_RGBA } from "../src/frame/redact.js";
import { ScreencastGuard } from "../src/frame/screencast.js";
import type { CastFrame, FieldSnapshot } from "../src/ports.js";
import { el, FakePage } from "./fakes.js";

const WIDTH = 200;
const HEIGHT = 100;

/** Stands in for the browser's own JPEG: opaque here, and meant to stay so. */
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

function castFrame(ack = 1, navigation = 0): CastFrame {
  return {
    bytes: JPEG,
    mediaType: "image/jpeg",
    ack,
    navigation,
    width: WIDTH,
    height: HEIGHT,
  };
}

const PASSWORD_BOX: FieldSnapshot = {
  descriptor: el({
    selector: "#password",
    inputType: "password",
    name: "password",
    pageUrl: "https://bazaar.example/account/signin",
  }),
  rect: { x: 20, y: 30, width: 60, height: 20 },
};

const SEARCH_BOX: FieldSnapshot = {
  descriptor: el({ selector: "#q", inputType: "search", name: "q" }),
  rect: { x: 120, y: 30, width: 60, height: 20 },
};

/** A real password field in a collapsed header menu: classified, not drawn. */
const OFFSCREEN_PASSWORD: FieldSnapshot = {
  descriptor: PASSWORD_BOX.descriptor,
  rect: { x: 0, y: 0, width: 0, height: 0 },
};

const FOCUSED_PASSWORD = el({
  selector: "#password",
  id: "password",
  inputType: "password",
  name: "password",
  pageUrl: "https://bazaar.example/account/signin",
});

function guardOn(
  fields: readonly FieldSnapshot[],
  focused: ReturnType<typeof el> | null = null,
) {
  const page = new FakePage({
    url: "https://bazaar.example/",
    fields,
    focused,
  });
  return { page, guard: new ScreencastGuard(page, new FieldClassifier()) };
}

/**
 * The screencast is the fast path, and the reason it is allowed to be fast is
 * that it skips the *repainting* and never the check. These tests are the
 * check: every frame is classified, and the only frame that leaves without
 * being decoded is one the classifier found nothing to paint on.
 */
describe("a screencast frame of a page with nothing sensitive on it", () => {
  it("is forwarded as the browser's own bytes, unmodified", async () => {
    const { guard } = guardOn([SEARCH_BOX]);
    const verdict = await guard.judge(castFrame());
    expect(verdict.kind).toBe("frame");
    if (verdict.kind !== "frame") return;
    expect(verdict.frame.passthrough).toBe(true);
    expect(verdict.frame.redacted).toBe(0);
    expect(verdict.frame.mediaType).toBe("image/jpeg");
    expect([...verdict.frame.bytes]).toEqual([...JPEG]);
  });

  it("still asks the classifier, on every single frame", async () => {
    const { page, guard } = guardOn([SEARCH_BOX]);
    await guard.judge(castFrame(1));
    await guard.judge(castFrame(2));
    await guard.judge(castFrame(3));
    // Every frame, not every other one: the fast path is not an unguarded
    // path. Focus is no longer read here because focus no longer decides
    // anything — a protected field is painted like any other sensitive one.
    expect(page.fieldReads).toBe(3);
  });

  it("reports the viewport it is of, so a relayed click still lands", async () => {
    const { guard } = guardOn([]);
    const verdict = await guard.judge(castFrame());
    if (verdict.kind !== "frame") throw new Error("expected a frame");
    expect(verdict.frame.width).toBe(WIDTH);
    expect(verdict.frame.height).toBe(HEIGHT);
  });
});

describe("a screencast frame of a page that has something to hide", () => {
  it("is never forwarded — it asks for the shutter instead", async () => {
    const { guard } = guardOn([PASSWORD_BOX, SEARCH_BOX]);
    const verdict = await guard.judge(castFrame());
    expect(verdict.kind).toBe("repaint");
    if (verdict.kind !== "repaint") return;
    expect(verdict.rects).toEqual([PASSWORD_BOX.rect]);
  });

  it("keeps asking for the shutter while the field is still there", async () => {
    const { guard } = guardOn([PASSWORD_BOX]);
    expect((await guard.judge(castFrame(1))).kind).toBe("repaint");
    expect((await guard.judge(castFrame(2))).kind).toBe("repaint");
  });

  /**
   * The pixels are of the page at time T and the fields are read at T+δ. A
   * field that was on screen and vanished in between would escape a read that
   * only looked at "now", so the previous frame's read is carried forward and
   * unioned — the same trick, and the same reason, as the polled path's
   * before/after union.
   */
  it("covers a field that vanished between the pixels and the read", async () => {
    const page = new FakePage({
      url: "https://bazaar.example/account/signin",
      fields: [PASSWORD_BOX],
    });
    const guard = new ScreencastGuard(page, new FieldClassifier());
    await guard.prime();
    page.setFields([SEARCH_BOX]);
    expect((await guard.judge(castFrame())).kind).toBe("repaint");
    // And once it has been gone for a whole frame, the fast path resumes.
    expect((await guard.judge(castFrame(2))).kind).toBe("frame");
  });
});

/**
 * The fast path's test for "is there anything to paint" must be the same
 * question `paintRects` answers by painting, or the two disagree and one of
 * them is wrong about a credential.
 */
describe("a sensitive field with no pixels on the frame", () => {
  it("does not force the slow path, because painting it would paint nothing", async () => {
    const { guard } = guardOn([OFFSCREEN_PASSWORD, SEARCH_BOX]);
    expect((await guard.judge(castFrame())).kind).toBe("frame");
  });

  it("is the same rect the redactor also declines to paint", () => {
    const image = {
      width: WIDTH,
      height: HEIGHT,
      pixels: new Uint8Array(WIDTH * HEIGHT * 4).fill(200),
    };
    expect(paintRects(image, [OFFSCREEN_PASSWORD.rect])).toBe(0);
    expect(paintRects(image, [PASSWORD_BOX.rect])).toBe(1);
  });
});

/** Focus used to end the picture; it is now painted like any other rect, and
 *  no input to this guard produces a blackout any more. */
describe("a screencast frame while a protected field has focus", () => {
  it("goes to the path that can paint it, rather than stopping", async () => {
    for (const on of [FOCUSED_PASSWORD, null]) {
      const { guard } = guardOn([PASSWORD_BOX, SEARCH_BOX], on);
      const verdict = await guard.judge(castFrame());
      expect(verdict.kind).toBe("repaint");
      if (verdict.kind === "repaint")
        expect(verdict.rects).toEqual([PASSWORD_BOX.rect]);
    }
  });
});

/**
 * The one guarantee that has to hold identically on both paths: whatever the
 * screencast forwards, the shutter would have produced the same pixels.
 */
describe("the two paths agree", () => {
  it("paints the same box the shutter would have", async () => {
    const pixels = new Uint8Array(WIDTH * HEIGHT * 4).fill(200);
    const png = encodePng({ width: WIDTH, height: HEIGHT, pixels });
    const page = new FakePage({
      url: "https://bazaar.example/account/signin",
      fields: [PASSWORD_BOX],
      png,
    });
    const guard = new ScreencastGuard(page, new FieldClassifier());
    const verdict = await guard.judge(castFrame());
    if (verdict.kind !== "repaint") throw new Error("expected a repaint");
    const image = decodePng(png);
    expect(paintRects(image, verdict.rects)).toBe(1);
    const at = (30 * WIDTH + 50) * 4;
    expect([...image.pixels.subarray(at, at + 4)]).toEqual([...REDACTION_RGBA]);
  });
});
