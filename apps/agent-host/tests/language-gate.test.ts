import { describe, expect, it } from "vitest";

import {
  CORRECTIVE,
  obeys,
  readsHindi,
} from "../src/purchase/language-gate.js";
import { runErrand } from "../src/purchase/errand-run.js";
import { RecordingLogger } from "./support/fakes.js";

/**
 * The gate reads the committed answer; it never decides what the shopper
 * speaks. Every case here drives a script that disobeys, so the enforcement is
 * provable with no model in the room.
 */
describe("the language gate reads the answer, it does not detect a language", () => {
  const ENGLISH = "Shop an SSD for me at Amazon";
  const HINGLISH =
    "Main Amazon India par SSD ki listings abhi dekh raha hoon aur " +
    "sabse sasta wala mila.";
  const DEVANAGARI = "मैंने Amazon India पर SSD की listings देखीं।";
  const REPLY =
    "The Crucial X9 1TB is ₹15,499 on Amazon India's page, and it is the " +
    "one I would buy: the cheaper Consistent drive is SATA, not NVMe.";

  it("names romanised Hindi and Devanagari alike, and English neither", () => {
    expect(readsHindi(HINGLISH)).toBe(true);
    expect(readsHindi(DEVANAGARI)).toBe(true);
    expect(readsHindi(REPLY)).toBe(false);
  });

  it("refuses a Hindi answer to an English line", () => {
    expect(obeys(HINGLISH, null, ENGLISH)).toBe(false);
    expect(obeys(DEVANAGARI, null, ENGLISH)).toBe(false);
    expect(obeys(REPLY, null, ENGLISH)).toBe(true);
  });

  it("lets the picker outrank the line, in both directions", () => {
    expect(obeys(HINGLISH, "en-IN", "अमेज़ॉन पर SSD ढूंढो")).toBe(false);
    expect(obeys(REPLY, "en-IN", "अमेज़ॉन पर SSD ढूंढो")).toBe(true);
  });

  /** One-directional on purpose: no mechanical test can rank romanised Hindi
   *  against Devanagari as an answer to a Hindi shopper, so it does not try. */
  it("never accuses an answer to a shopper who wrote Hindi", () => {
    expect(obeys(HINGLISH, null, "Amazon par mere liye ek SSD dhundho")).toBe(
      true,
    );
    expect(obeys(REPLY, "hi-IN", ENGLISH)).toBe(true);
    expect(obeys(DEVANAGARI, "hi-IN", ENGLISH)).toBe(true);
  });
});

/**
 * A misbehaving errand: it answers the looking leg, then the summarise leg in
 * whichever languages the test names, one per call. Nothing about it is a
 * model — it is a script that disobeys, which is the only kind of collaborator
 * an enforcement test needs.
 */
function errandSaying(...replies: readonly string[]) {
  const said: string[] = [];
  return {
    prompts: said,
    converse: async (userMessage: string) => {
      said.push(userMessage);
      const text = replies[said.length - 1] ?? "";
      return { transcript: [text], blocked: [], turns: 1, completed: true };
    },
  };
}

const LOOKED = "looked";

function promptsFor(stated: readonly string[], replyLanguage: string | null) {
  // `summarise` is built after the looking leg, not before it: what the window
  // was shown is only known once it has been shown it.
  return { look: "go", summarise: () => "say", stated, replyLanguage };
}

describe("a commit in the wrong language is regenerated, not shipped", () => {
  const ENGLISH = ["Shop an SSD for me at Amazon"];
  const HINGLISH =
    "Main Amazon India par SSD ki listings abhi dekh raha hoon aur sabse " +
    "sasta wala mila.";
  const GOOD = "The Crucial X9 1TB is ₹15,499 on Amazon India's own page.";

  it("commits a reply that obeys, and asks for nothing more", async () => {
    const errand = errandSaying(LOOKED, GOOD);
    const run = await runErrand(
      errand,
      promptsFor(ENGLISH, null),
      new RecordingLogger(),
    );
    expect(run.told).toBe(GOOD);
    expect(run.slipped).toBe(false);
    // Two legs and no third: a reply that passes costs nothing.
    expect(errand.prompts).toHaveLength(2);
  });

  it("regenerates once, with the correction adjacent to the ask", async () => {
    const errand = errandSaying(LOOKED, HINGLISH, GOOD);
    const run = await runErrand(
      errand,
      promptsFor(ENGLISH, null),
      new RecordingLogger(),
    );
    expect(run.told).toBe(GOOD);
    expect(run.slipped).toBe(false);
    expect(errand.prompts).toHaveLength(3);
    expect(errand.prompts[2]).toContain(CORRECTIVE.trim());
  });

});

describe("a reply the gate cannot rescue is still committed, with a note", () => {
  const ENGLISH = ["Shop an SSD for me at Amazon"];
  const HINGLISH =
    "Main Amazon India par SSD ki listings abhi dekh raha hoon aur sabse " +
    "sasta wala mila.";

  it("commits the answer with a note rather than nothing, if it slips twice", async () => {
    const errand = errandSaying(LOOKED, HINGLISH, HINGLISH);
    const run = await runErrand(
      errand,
      promptsFor(ENGLISH, null),
      new RecordingLogger(),
    );
    expect(run.told).toBe(HINGLISH);
    expect(run.slipped).toBe(true);
  });

  it("never regenerates for a shopper who wrote Hindi", async () => {
    const errand = errandSaying(LOOKED, HINGLISH);
    const run = await runErrand(
      errand,
      promptsFor(["Amazon par mere liye ek SSD dhundho"], null),
      new RecordingLogger(),
    );
    expect(run.told).toBe(HINGLISH);
    expect(errand.prompts).toHaveLength(2);
  });
});
