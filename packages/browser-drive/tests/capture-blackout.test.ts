// The protected-field policy, on both sides of the wheel.
//
// This file used to assert the opposite: that a protected field holding focus
// stopped the shutter entirely. That is reversed, and the reasoning is in
// frame-capture.ts. The short version is that stopping was a latch — measured
// on a real checkout page, one stop and the picture never came back for the
// life of the window — and that a card which goes black exactly when the
// shopper reaches the payment step is the worst possible moment to lose it.
//
// The redaction claim is unchanged and is carried the way §5.13 always
// described it: the sensitive rectangles are painted opaque in the PNG bytes
// before they leave, the focused field included. What is asserted here is that
// the picture survives and the secret does not.
import { describe, expect, it } from "vitest";

import { FieldClassifier } from "../src/field/field-classifier.js";
import { FrameCapture } from "../src/frame/frame-capture.js";
import type { RasterImage } from "../src/frame/png.js";
import { decodePng, encodePng } from "../src/frame/png.js";
import { REDACTION_RGBA } from "../src/frame/redact.js";
import type { FieldSnapshot } from "../src/ports.js";
import { el, FakePage } from "./fakes.js";

const WIDTH = 200;
const HEIGHT = 100;

/** A per-pixel pattern, so "painted" and "untouched" are both checkable. */
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

const PNG = encodePng(canvas());

function pixelAt(image: RasterImage, x: number, y: number): number[] {
  const at = (y * image.width + x) * 4;
  return [...image.pixels.subarray(at, at + 4)];
}

const PASSWORD = el({
  selector: "#password",
  id: "password",
  inputType: "password",
  name: "password",
  pageUrl: "https://bazaar.example/checkout",
});

const CVV = el({
  selector: "#cvv",
  id: "cvv",
  name: "cvv",
  pageUrl: "https://bazaar.example/checkout",
});

/** Deliberately not on the checkout page: the classifier treats a checkout
 *  URL as sensitive context, and this field is the control for that. */
const SEARCH = el({
  selector: "#q",
  id: "q",
  inputType: "search",
  name: "q",
  pageUrl: "https://bazaar.example/products/trailfoot-runner",
});

function box(descriptor: ReturnType<typeof el>): FieldSnapshot {
  return { descriptor, rect: { x: 20, y: 30, width: 60, height: 20 } };
}

type Driving = "agent-drive" | "user-drive";

function rig(
  focused: ReturnType<typeof el> | null,
  from: Driving = "agent-drive",
) {
  let state: Driving = from;
  const page = new FakePage({
    url: "https://bazaar.example/checkout",
    png: PNG,
    focused,
    fields: focused === null ? [] : [box(focused)],
  });
  return {
    page,
    hand: (to: Driving) => {
      state = to;
    },
    frames: new FrameCapture(page, new FieldClassifier(), () => state),
  };
}

/** The frame, or a failure that names what came back instead. */
async function frameFrom(frames: FrameCapture) {
  const capture = await frames.capture();
  if (capture.kind !== "frame")
    throw new Error(`expected a frame, got ${capture.kind}`);
  return capture.frame;
}

describe("a protected field while the agent is driving", () => {
  it("keeps taking the picture", async () => {
    const { page, frames } = rig(PASSWORD);
    expect((await frames.capture()).kind).toBe("frame");
    expect(page.screenshots).toBe(1);
  });

  it("paints the field out of the bytes that leave", async () => {
    const frame = await frameFrom(rig(PASSWORD).frames);
    const image = decodePng(frame.bytes);
    expect(frame.redacted).toBe(1);
    const points: readonly (readonly [number, number])[] = [
      [20, 30],
      [50, 40],
      [79, 49],
    ];
    for (const [x, y] of points) {
      expect(pixelAt(image, x, y)).toEqual([...REDACTION_RGBA]);
    }
  });

  it("leaves the rest of the page alone", async () => {
    const frame = await frameFrom(rig(PASSWORD).frames);
    const image = decodePng(frame.bytes);
    expect(pixelAt(image, 150, 80)).toEqual([
      150 % 256,
      80,
      (150 + 80) % 256,
      255,
    ]);
  });
});

describe("which fields the paint covers", () => {
  it("covers payment data on the same rule, not just passwords", async () => {
    const frame = await frameFrom(rig(CVV).frames);
    expect(frame.redacted).toBe(1);
  });

  it("paints nothing when the focused field is an ordinary one", async () => {
    const rigged = rig(SEARCH);
    const frame = await frameFrom(rigged.frames);
    expect(frame.redacted).toBe(0);
    expect(rigged.page.screenshots).toBe(1);
  });
});

/**
 * The sequence from the user's dead-frames screenshot: the wheel goes to them
 * and back while a protected field is on screen, twice. Every step has to end
 * with a picture — that is the whole of what broke.
 */
describe("handing the wheel back and forth over a protected field", () => {
  it("never stops producing frames, and paints again on every handback", async () => {
    const rigged = rig(PASSWORD);
    const redactions: number[] = [];

    for (let round = 0; round < 2; round += 1) {
      // The agent has it: painted.
      redactions.push((await frameFrom(rigged.frames)).redacted);
      rigged.hand("user-drive");
      // Theirs: shown, because they are the one typing into it.
      redactions.push((await frameFrom(rigged.frames)).redacted);
      rigged.hand("agent-drive");
    }
    redactions.push((await frameFrom(rigged.frames)).redacted);

    expect(redactions).toEqual([1, 0, 1, 0, 1]);
    // Five captures, five shutter openings: nothing latched shut.
    expect(rigged.page.screenshots).toBe(5);
  });
});

/**
 * The wheel changes who may look, never who may type — and while the user
 * drives they see the field they are filling in, unmasked, which is what makes
 * "take the wheel and pay" possible at all.
 */
describe("a protected field while the user is driving", () => {
  it("shows it, because the watcher is the typist", async () => {
    const frame = await frameFrom(rig(CVV, "user-drive").frames);
    expect(frame.redacted).toBe(0);
  });

  it("paints again the moment the wheel goes back", async () => {
    const rigged = rig(CVV, "user-drive");
    expect((await frameFrom(rigged.frames)).redacted).toBe(0);
    rigged.hand("agent-drive");
    expect((await frameFrom(rigged.frames)).redacted).toBe(1);
  });
});
