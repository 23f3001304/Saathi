import { describe, expect, it } from "vitest";
import { OFF, shouldSpeak, spoken, toggled } from "../src/sound/soundState.ts";

describe("the sound switch", () => {
  it("is off until someone turns it on", () => {
    expect(OFF.on).toBe(false);
    expect(shouldSpeak(OFF, "curtain")).toBe(false);
  });
  it("speaks each beat once, and again only when asked", () => {
    const on = toggled(OFF);
    expect(shouldSpeak(on, "curtain")).toBe(true);
    const after = spoken(on, "curtain");
    expect(shouldSpeak(after, "curtain")).toBe(false);
    expect(shouldSpeak(after, "curtain", true)).toBe(true);
  });
  it("forgets nothing when switched off and on", () => {
    const s = toggled(toggled(spoken(toggled(OFF), "bill")));
    expect(shouldSpeak(s, "bill")).toBe(false);
  });
});
