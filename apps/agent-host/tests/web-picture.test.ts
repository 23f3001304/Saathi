// The one capture path the errand sees the window through. Every assertion
// here is about a picture that must or must not leave this process: the
// shutter, the wheel, and a shutter that simply broke.
import { decodePng, encodePng } from "@covenant/browser-drive";
import type { Capture, SessionState } from "@covenant/browser-drive";
import { describe, expect, it } from "vitest";

import { PICTURE_SETTLE_MS, pictureOf } from "../src/browser/web-picture.js";

const WIDTH = 240;
const HEIGHT = 160;

function png(): Uint8Array {
  return encodePng({
    width: WIDTH,
    height: HEIGHT,
    pixels: new Uint8Array(WIDTH * HEIGHT * 4),
  });
}

function shot(redacted = 2): Capture {
  return {
    kind: "frame",
    frame: {
      bytes: png(),
      mediaType: "image/png",
      width: WIDTH,
      height: HEIGHT,
      redacted,
      navigation: 3,
      passthrough: false,
    },
  };
}

const SHUTTERED: Capture = {
  kind: "blackout",
  blackout: {
    category: "password",
    rule: "protected_focus",
    human: "A protected field has focus.",
  },
};

/** One window and the beat before its shutter, both recorded. */
class Watched {
  readonly slept: number[] = [];
  shots = 0;

  constructor(
    private readonly capture: () => Promise<Capture>,
    private readonly state: SessionState = "agent-drive",
  ) {}

  currentState(): SessionState {
    return this.state;
  }

  screenshot(): Promise<Capture> {
    this.shots += 1;
    return this.capture();
  }

  sleep(ms: number): Promise<void> {
    this.slept.push(ms);
    return Promise.resolve();
  }
}

function bytesOf(image: string): Uint8Array {
  return new Uint8Array(
    Buffer.from(image.replace("data:image/png;base64,", ""), "base64"),
  );
}

describe("the picture a move leaves behind", () => {
  it("comes back as a data URL of the redacted frame with the grid on it", async () => {
    const window = new Watched(() => Promise.resolve(shot()));
    const seen = await pictureOf(window, window);
    expect(seen.note).toBe("attached");
    expect(seen.image?.startsWith("data:image/png;base64,")).toBe(true);
    expect(seen.width).toBe(WIDTH);
    expect(seen.height).toBe(HEIGHT);
    expect(seen.redacted).toBe(2);
    // The grid is burned in, not described: the blank capture came back with
    // orange pixels on it where the 100px lines fall.
    const drawn = decodePng(bytesOf(seen.image ?? ""));
    expect(drawn.pixels[(0 * WIDTH + 100) * 4]).toBeGreaterThan(0);
  });

  it("waits one settle beat, no longer, before the shutter opens", async () => {
    const window = new Watched(() => Promise.resolve(shot()));
    await pictureOf(window, window);
    expect(window.slept).toEqual([PICTURE_SETTLE_MS]);
    expect(PICTURE_SETTLE_MS).toBeLessThanOrEqual(500);
    expect(window.shots).toBe(1);
  });
});

describe("the pictures that do not leave", () => {
  it("withholds it while a protected field has focus, and says so", async () => {
    const window = new Watched(() => Promise.resolve(SHUTTERED));
    const seen = await pictureOf(window, window);
    expect(seen.image).toBe(null);
    expect(seen.note).toBe("withheld: a protected field has focus");
  });

  // The wheel moves inside a refused move: the classifier blocks a password
  // box and hands the window over in the same call. The capture path stops
  // redacting for the person driving, so the picture must stop here.
  it("withholds it the moment the window is the shopper's", async () => {
    const window = new Watched(() => Promise.resolve(shot()), "user-drive");
    const seen = await pictureOf(window, window);
    expect(seen.image).toBe(null);
    expect(seen.note).toMatch(/^withheld/);
    expect(window.shots).toBe(0);
  });

  it("says the window could not be pictured rather than failing the move", async () => {
    const window = new Watched(() => Promise.reject(new Error("no target")));
    const seen = await pictureOf(window, window);
    expect(seen.image).toBe(null);
    expect(seen.note).toMatch(/^withheld/);
  });
});
