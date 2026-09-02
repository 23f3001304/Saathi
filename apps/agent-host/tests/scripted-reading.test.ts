// The scripted fake model's reading of a budget off the sentence. Live mode
// never runs this: the model proposes the ceiling in propose_purchase and
// the human sees it on the sheet. Scripted mode has no model, so the script
// reads the number itself, and a mandate looser than the sentence is still
// the one thing it must never draft.
import { describe, expect, it } from "vitest";

import { ceilingFor, statedCeilingPaise } from "../src/session/scripted-reading.js";

const CAP = 500_000;

describe("reading the number the shopper actually said", () => {
  it("hears the phrasing that started this", () => {
    expect(statedCeilingPaise("navy running shoes under 4000 rupees, UK 8")).toBe(
      400_000,
    );
  });

  it("hears a rupee sign and thousands separators", () => {
    expect(statedCeilingPaise("a navy kurta under ₹2,000, refundable")).toBe(
      200_000,
    );
  });

  it("hears the other ways people bound a budget", () => {
    expect(statedCeilingPaise("at most 1500")).toBe(150_000);
    expect(statedCeilingPaise("up to Rs 900")).toBe(90_000);
    expect(statedCeilingPaise("no more than 250")).toBe(25_000);
    expect(statedCeilingPaise("my budget is 3000")).toBe(300_000);
    expect(statedCeilingPaise("₹700 or less")).toBe(70_000);
  });

  it("hears 2k as two thousand", () => {
    expect(statedCeilingPaise("shoes under 2k")).toBe(200_000);
  });
});

describe("what it refuses to read as a ceiling", () => {
  it("says nothing when no bound was stated", () => {
    expect(statedCeilingPaise("I want navy running shoes, UK 8")).toBeNull();
  });

  it("does not treat an approximate price as a bound", () => {
    expect(statedCeilingPaise("something around 4000")).toBeNull();
  });

  it("does not read a size as money", () => {
    expect(statedCeilingPaise("running shoes UK 8")).toBeNull();
  });
});

describe("the ceiling a mandate may carry", () => {
  it("takes the shopper's number when it is tighter than the cap", () => {
    expect(ceilingFor("shoes under 4000 rupees", CAP)).toBe(400_000);
  });

  it("keeps the operator's cap when the shopper asks for more", () => {
    expect(ceilingFor("a laptop under 90000 rupees", CAP)).toBe(CAP);
  });

  it("falls back to the cap when nothing was stated", () => {
    expect(ceilingFor("navy running shoes, UK 8", CAP)).toBe(CAP);
  });

  it("never drafts a ceiling of nothing", () => {
    expect(ceilingFor("under 0 rupees", CAP)).toBe(CAP);
  });
});
