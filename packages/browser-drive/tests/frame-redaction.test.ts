import { describe, expect, it } from "vitest";

import { FieldClassifier } from "../src/field/field-classifier.js";
import { FrameCapture } from "../src/frame/frame-capture.js";
import type { RasterImage } from "../src/frame/png.js";
import { decodePng, encodePng } from "../src/frame/png.js";
import { REDACTION_RGBA } from "../src/frame/redact.js";
import type { FieldSnapshot } from "../src/ports.js";
import { FakePage } from "./fake-page.js";
import { el, frameOf } from "./fakes.js";

const WIDTH = 200;
const HEIGHT = 100;

/** A distinctive per-pixel pattern, so "untouched" is checkable, not assumed. */
function canvas(): RasterImage {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const at = (y * WIDTH + x) * 4;
      pixels[at] = x % 256;
      pixels[at + 1] = y % 256;
      pixels[at + 2] = (x + y) % 256;
      pixels[at + 3] = 255;
    }
  }
  return { width: WIDTH, height: HEIGHT, pixels };
}

function pixelAt(image: RasterImage, x: number, y: number): number[] {
  const at = (y * image.width + x) * 4;
  return [...image.pixels.subarray(at, at + 4)];
}

const PASSWORD: FieldSnapshot = {
  descriptor: el({
    selector: "#password",
    inputType: "password",
    name: "password",
    pageUrl: "https://bazaar.example/account/signin",
  }),
  rect: { x: 20, y: 30, width: 60, height: 20 },
};

const SEARCH: FieldSnapshot = {
  descriptor: el({ selector: "#q", inputType: "search", name: "q" }),
  rect: { x: 120, y: 30, width: 60, height: 20 },
};

function capture(fields: readonly FieldSnapshot[]): FrameCapture {
  const page = new FakePage({
    url: "https://bazaar.example/account/signin",
    fields,
    png: encodePng(canvas()),
  });
  return new FrameCapture(page, new FieldClassifier());
}

describe("the PNG the frame path round-trips", () => {
  it("decodes back to the pixels it encoded", () => {
    const decoded = decodePng(encodePng(canvas()));
    expect(decoded.width).toBe(WIDTH);
    expect(decoded.height).toBe(HEIGHT);
    expect([...decoded.pixels]).toEqual([...canvas().pixels]);
  });
});

describe("a frame leaving the machine", () => {
  it("blanks the whole rect of a password field", async () => {
    const frame = frameOf(await capture([PASSWORD, SEARCH]).capture());
    const image = decodePng(frame.bytes);
    expect(frame.redacted).toBe(1);
    for (const [x, y] of [
      [20, 30],
      [50, 40],
      [79, 49],
    ]) {
      expect(pixelAt(image, x ?? 0, y ?? 0)).toEqual([...REDACTION_RGBA]);
    }
  });

  it("covers the field's edges, which antialiasing bleeds past", async () => {
    const image = decodePng(frameOf(await capture([PASSWORD]).capture()).bytes);
    // One pixel outside the declared box on each side is still painted.
    expect(pixelAt(image, 19, 29)).toEqual([...REDACTION_RGBA]);
    expect(pixelAt(image, 81, 51)).toEqual([...REDACTION_RGBA]);
  });
});

describe("everything on the frame that is not a secret", () => {
  it("comes through exactly as it was", async () => {
    const image = decodePng(
      frameOf(await capture([PASSWORD, SEARCH]).capture()).bytes,
    );
    const original = canvas();
    for (const [x, y] of [
      [150, 40],
      [5, 5],
      [199, 99],
    ]) {
      expect(pixelAt(image, x ?? 0, y ?? 0)).toEqual(
        pixelAt(original, x ?? 0, y ?? 0),
      );
    }
  });
});

describe("a checkout page's card field", () => {
  it("is redacted on the same rule the agent is blocked by", async () => {
    const frame = frameOf(
      await capture([
        {
          descriptor: el({
            selector: "#card-number",
            name: "cardNumber",
            autocomplete: "cc-number",
            pageUrl: "https://bazaar.example/checkout",
          }),
          rect: { x: 10, y: 10, width: 40, height: 12 },
        },
      ]).capture(),
    );
    expect(frame.redacted).toBe(1);
    expect(pixelAt(decodePng(frame.bytes), 30, 15)).toEqual([...REDACTION_RGBA]);
  });

  it("emits no frame at all when the bytes cannot be read", async () => {
    const page = new FakePage({
      url: "https://bazaar.example/",
      fields: [PASSWORD],
      png: Uint8Array.of(1, 2, 3, 4),
    });
    await expect(
      new FrameCapture(page, new FieldClassifier()).capture(),
    ).rejects.toThrow(/not one the sandbox frame path can redact/);
  });
});
