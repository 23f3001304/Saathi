// The dark-pattern shield used to be a paragraph in `buyer-prompt.ts`, which
// means it held exactly as long as the model chose to cooperate — and a prompt
// injection is an argument aimed at precisely that. These assertions are about
// the shield holding when the model does not.
import { describe, expect, it } from "vitest";

import {
  detectAcross,
  detectManipulation,
} from "../src/manipulation/detector.js";
import { MANIPULATION_KINDS, PATTERNS } from "../src/manipulation/patterns.js";

function kinds(text: string): readonly string[] {
  return detectManipulation(text).kinds;
}

describe("naming what the shop is doing", () => {
  it("hears scarcity", () => {
    expect(kinds("Only 2 left in stock — selling fast")).toContain("scarcity");
  });

  it("hears a deadline", () => {
    expect(kinds("Flash sale, today only, ends in 3 hours")).toContain(
      "urgency",
    );
  });

  it("hears an anchor the shop drew itself", () => {
    expect(kinds("Was ₹2,999 — 40% off")).toContain("false_anchor");
  });

  it("hears a fee held back for the end", () => {
    expect(kinds("Taxes extra, convenience fee at checkout")).toContain(
      "drip_pricing",
    );
  });
});

describe("naming what the shop is doing, continued", () => {
  it("hears the sentence written to shame a refusal", () => {
    expect(kinds("No thanks, I like paying full price")).toContain(
      "confirmshaming",
    );
  });

  it("hears a box someone ticked on the buyer's behalf", () => {
    expect(kinds("Protection plan added for you")).toContain("preselection");
  });

  it("hears the crowd being invoked", () => {
    expect(kinds("37 people are viewing this right now")).toContain(
      "social_proof",
    );
  });

  it("hears a return policy written to be missed", () => {
    expect(kinds("Non-refundable. See terms for details.")).toContain(
      "obstruction",
    );
  });
});

describe("what it refuses to do", () => {
  it("says nothing about an ordinary listing", () => {
    const plain = "Navy cotton kurta, size M. Handloom cotton, 30-day returns.";
    expect(detectManipulation(plain).cues).toEqual([]);
  });

  it("counts a pattern once however often the page repeats it", () => {
    const shouty = "HURRY! hurry, only 1 left, only 2 left, last few!";
    const scarcity = detectManipulation(shouty).kinds.filter(
      (kind) => kind === "scarcity",
    );
    expect(scarcity).toHaveLength(1);
  });

  it("reads the whole listing, not one field", () => {
    const found = detectAcross([
      "Navy cotton kurta",
      null,
      "Convenience fee at checkout",
    ]);
    expect(found.kinds).toContain("drip_pricing");
  });

  it("shows the words it matched rather than asserting a judgement", () => {
    const [cue] = detectManipulation("Only 3 left in stock").cues;
    expect(cue?.phrase.toLowerCase()).toContain("only 3 left");
  });

  it("has nothing to say about an empty listing", () => {
    expect(detectManipulation("   ").cues).toEqual([]);
  });
});

describe("the taxonomy itself", () => {
  it("gives every named pattern a bias, a counter and cues", () => {
    expect(PATTERNS).toHaveLength(MANIPULATION_KINDS.length);
    for (const spec of PATTERNS) {
      expect(spec.bias.length).toBeGreaterThan(0);
      expect(spec.counter.length).toBeGreaterThan(0);
      expect(spec.cues.length).toBeGreaterThan(0);
    }
  });
});
