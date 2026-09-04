import { describe, expect, it } from "vitest";

import { spokenText } from "../src/voice/spokenText.ts";

/**
 * The synthesizer used to be handed the model's raw markdown, so a shopper in
 * voice mode heard the asterisks. This renders the same parsed document the
 * screen renders, as audio.
 */
describe("what the synthesizer is handed", () => {
  it("drops emphasis, which has no spoken form", () => {
    expect(spokenText("I would buy the **Lexar NM790 2TB**.")).toBe(
      "I would buy the Lexar NM790 2TB.",
    );
    expect(spokenText("that is _quite_ cheap")).toBe("that is quite cheap");
  });

  it("reads a link as its words, never its address", () => {
    expect(spokenText("see [the listing](https://example.com/x)")).toBe(
      "see the listing",
    );
  });

  it("turns a bulleted list into sentences a listener can follow", () => {
    const said = spokenText("- Lexar NM790\n- Crucial P2");
    expect(said).toBe("Lexar NM790. Crucial P2");
    expect(said).not.toContain("-");
  });

  it("keeps a numbered step's marker, which is how a list is followed", () => {
    expect(spokenText("1. open the page\n2. add it")).toBe(
      "1 open the page. 2 add it",
    );
  });

  it("leaves the reply's own ending exactly as the model wrote it", () => {
    expect(spokenText("Ready?")).toBe("Ready?");
    expect(spokenText("हो गया।")).toBe("हो गया।");
    // No terminator invented for a reply that did not have one.
    expect(spokenText("almost there")).toBe("almost there");
  });

  it("says nothing for nothing", () => {
    expect(spokenText("")).toBe("");
    expect(spokenText("   \n  ")).toBe("");
  });
});
