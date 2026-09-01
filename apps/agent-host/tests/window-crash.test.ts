// A window whose renderer has died is a window with no picture, not a 500. The
// card's poll got an unhandled throw from a route whose entire job is "what
// does it look like right now?".
import { describe, expect, it } from "vitest";

import {
  lookCast,
  lookFields,
  lookFrame,
} from "../src/browser/browser-look.js";

describe("looking at a window whose renderer has died", () => {
  const crashed = {
    screenshot: () =>
      Promise.reject(
        new Error("Protocol error (Runtime.callFunctionOn): Target crashed"),
      ),
    fields: () => Promise.reject(new Error("Target crashed")),
    screencast: () => {
      throw new Error("Target crashed");
    },
  } as unknown as Parameters<typeof lookFrame>[0];

  it("answers with no picture, not a 500", async () => {
    // The card's poll got an unhandled throw from a route whose entire job is
    // "what does it look like right now?". A crashed target answers the same
    // as a closed one: nothing.
    await expect(lookFrame(crashed)).resolves.toBeNull();
  });

  it("answers with no fields and no cast either", async () => {
    await expect(lookFields(crashed)).resolves.toEqual([]);
    expect(lookCast(crashed)).toBeNull();
  });
});
