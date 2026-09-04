import { describe, expect, it } from "vitest";

import { turnPlanClosing } from "../src/buyer/turn-plan-prompt.js";

/**
 * The app's language picker is a standing instruction, and it was losing.
 * The closing named the setting, then immediately told the model to write in
 * "that line's own language" - a longer, later, more specific rule that won
 * every time. Live: picker on en-IN, shopper wrote Hindi, both replies came
 * back Hindi. The two rules are now exclusive rather than layered.
 */
describe("the language picker against what the shopper typed", () => {
  const HINDI = "मुझे 20000 रुपये से कम में SSD चाहिए";

  it("does not tell the model to match the line when a language is set", () => {
    const closing = turnPlanClosing(HINDI, "en-IN");
    expect(closing).not.toMatch(/that line's own language/i);
  });

  it("names the set language as the one to write in", () => {
    const closing = turnPlanClosing(HINDI, "en-IN");
    expect(closing).toContain("en-IN");
    expect(closing).toMatch(/every word/i);
  });

  it("says the setting holds however the shopper writes", () => {
    const closing = turnPlanClosing(HINDI, "en-IN");
    expect(closing).toMatch(/whatever language|regardless|even when/i);
  });

  it("still matches the shopper's line when no language is set", () => {
    const closing = turnPlanClosing(HINDI, null);
    expect(closing).toMatch(/that line's own language/i);
    expect(closing).toContain(HINDI);
  });

  /** One reply is in one language whichever rule decided it. */
  it("forbids switching language inside a reply either way", () => {
    for (const setting of ["en-IN", null]) {
      expect(turnPlanClosing(HINDI, setting)).toMatch(
        /never change language inside one reply/i,
      );
    }
  });
});
