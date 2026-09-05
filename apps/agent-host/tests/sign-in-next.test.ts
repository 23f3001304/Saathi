import { describe, expect, it } from "vitest";

import { nextAfter } from "../src/browser/sign-in-next.js";

/**
 * The sentence beside `challenge` is what the model acts on, and for a while
 * it said "read the page and carry on" for every value but a code. So a shop
 * still showing its password box was handed back as a finished sign-in, and
 * the errand walked on past a wall it could not get through.
 */
describe("what the model is told after a sign-in submit", () => {
  it("stops and asks the shopper when the shop wants a code", () => {
    const said = nextAfter("code");
    expect(said).toContain("only the shopper has");
    expect(said).not.toContain("carry on");
  });

  it("says the shop refused, and does not send it back to the page", () => {
    const said = nextAfter("password");
    expect(said).toContain("still asking");
    expect(said).toContain("hand them the window");
    expect(said).not.toContain("carry on");
  });

  /** A code is the shopper's to give. A password never is, whatever the
   *  shop is asking for, so the one branch that could invite it forbids it. */
  it("forbids asking for the password in chat", () => {
    expect(nextAfter("password")).toContain("never ask them for a password");
  });

  it("carries on only when nothing is challenging", () => {
    expect(nextAfter(null)).toBe("Read the page and carry on.");
  });
});
