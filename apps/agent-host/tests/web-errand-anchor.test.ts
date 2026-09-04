// The errand runs on a conversation of its own, so the only clue it has to the
// shopper's language is the one handed to it. A live English SSD thread whose
// last sentence was "50,000rs" came back in Spanish: the anchor was that one
// fragment, and a fragment is not written in any language.
import type { TurnPlan } from "@covenant/agents";
import { beforeEach, describe, expect, it } from "vitest";

import { WebFindings } from "../src/browser/web-listing.js";
import { WebTrail } from "../src/browser/web-trail.js";
import { BeatHub } from "../src/http/beat-hub.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { errandFor } from "../src/purchase/web-errand.js";
import type { WebErrand } from "../src/purchase/web-look-step.js";
import { WebLookStep } from "../src/purchase/web-look-step.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";

const PLAN: TurnPlan = {
  action: "look_on_web",
  reply: "Opening Amazon now.",
  question: null,
  query: "1TB SSD under 50000",
  amendment: null,
  traits: [],
};

const asked: string[] = [];
let hub: BeatHub;
let trail: WebTrail;
let findings: WebFindings;

function lookStep(errand: WebErrand): WebLookStep {
  return new WebLookStep(
    hub,
    errand,
    trail,
    findings,
    new RecordingLogger(),
    "INR",
  );
}

function errand() {
  return {
    converse: (prompt: string) => {
      asked.push(prompt);
      trail.record("https://www.amazon.in/s?k=1tb+ssd");
      return Promise.resolve({
        transcript: ["", "Samsung 990 Pro, ₹9,499."],
        blocked: [],
        turns: 2,
        completed: true,
      });
    },
  };
}

beforeEach(() => {
  hub = new BeatHub(new StepClock(), new RecordingLogger());
  trail = new WebTrail();
  findings = new WebFindings();
  asked.length = 0;
});

describe("what the errand is told to write in", () => {
  it("quotes every line they wrote, not only the last fragment", () => {
    const composed = errandFor(
      "1TB SSD",
      ["I need a 1TB internal SSD for gaming from Amazon", "50,000rs"],
      "INR",
    );
    expect(composed).toContain("I need a 1TB internal SSD for gaming");
    expect(composed).toContain("50,000rs");
  });

  it("names the language only when the app was told one", () => {
    // Agnostic by construction: with no setting the prompt says nothing
    // about language at all, so nothing is inferred from their sentence or
    // from the pages just read. With a setting it says it once, plainly.
    const guessed = errandFor("kurta", ["mujhe navy kurti chahiye"], "INR");
    expect(guessed).not.toMatch(/language/i);
    const told = errandFor("kurta", ["mujhe navy kurti chahiye"], "INR", "Hindi");
    expect(told).toContain("Write your whole answer in Hindi.");
  });
});

describe("what the errand is told to do with a page it has read", () => {
  const composed = errandFor("1TB SSD", ["a 1TB SSD under 50000"], "INR");

  it("hands the reading to the model rather than doing it for it", () => {
    expect(composed).toContain("the money strings on it with the words");
    expect(composed).toContain("Read them like a person would.");
    expect(composed).toContain("call web_card once");
  });

  it("no longer promises that a verified row is already a card", () => {
    expect(composed).not.toContain("only rows that come back with a ref");
    expect(composed).toContain("Only rows web_card returns with a ref");
  });
});

describe("what the look hands the errand", () => {
  it("passes the shopper's own half of the conversation through", async () => {
    const step = lookStep(errand());
    await step.look(emptyResult("urn:run:1", "50,000rs"), PLAN, [
      "I need a 1TB internal SSD for gaming from Amazon",
      "50,000rs",
    ]);
    expect(asked[0]).toContain("I need a 1TB internal SSD for gaming");
  });

  it("falls back to the run's own sentence when no lines are given", async () => {
    const step = lookStep(errand());
    await step.look(emptyResult("urn:run:1", "a 1TB SSD from Amazon"), PLAN);
    expect(asked[0]).toContain("a 1TB SSD from Amazon");
  });
});
