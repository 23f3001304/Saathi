// Looking on the open web, as a terminal outcome of a turn. What the shopper
// reads is the model's one sentence, written after the looking with this
// host's own record of the errand in front of it. The harness adds no line of
// its own: the failure this path once fixed with a fixed English closer ("I
// could not get a page open") is now a fact in a data block, in whatever
// language the model answers in.
import type { ConversationResult, TurnPlan } from "@covenant/agents";
import { beforeEach, describe, expect, it } from "vitest";

import { WebFindings } from "../src/browser/web-listing.js";
import { WebTrail } from "../src/browser/web-trail.js";
import { BeatHub } from "../src/http/beat-hub.js";
import { OBSERVED_MARK } from "../src/purchase/observed-block.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import type { WebErrand } from "../src/purchase/web-look-step.js";
import { WebLookStep } from "../src/purchase/web-look-step.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";

const AMAZON = "https://www.amazon.in/s?k=1tb+ssd";

function planOf(over: Partial<TurnPlan> = {}): TurnPlan {
  return {
    action: "look_on_web",
    reply: "Opening Amazon now.",
    question: null,
    query: "1TB SSD under 50000",
    amendment: null,
    traits: [],
    ...over,
  };
}

function answered(text: string): ConversationResult {
  return { transcript: ["", text], blocked: [], turns: 2, completed: true };
}

/** An errand that walks the sandbox, writing the trail `WebShopper` writes,
 *  and answers the same sentence on both legs. */
function errandVisiting(trail: WebTrail, ...urls: string[]): WebErrand {
  return {
    converse: (prompt: string) => {
      asked.push(prompt);
      urls.forEach((url) => trail.record(url));
      return Promise.resolve(answered("Samsung 990 Pro, ₹9,499 on the page."));
    },
  };
}

let hub: BeatHub;
let trail: WebTrail;
let findings: WebFindings;
const asked: string[] = [];

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

function bubbles() {
  return hub
    .snapshot()
    .flatMap((beat) => (beat.kind === "message" ? [beat] : []));
}

/** The second leg's prompt: the one the sentence is written from. */
function summaryPrompt(): string {
  return asked[1] ?? "";
}

beforeEach(() => {
  hub = new BeatHub(new StepClock(), new RecordingLogger());
  trail = new WebTrail();
  findings = new WebFindings();
  asked.length = 0;
});

describe("the web is reachable from a look", () => {
  it("goes in the same turn it says it will, and drafts nothing", async () => {
    const step = lookStep(errandVisiting(trail, AMAZON));
    const result = await step.look(
      emptyResult("r1", "search amazon for a 1TB SSD under 50000"),
      planOf(),
    );
    expect(asked[0]).toContain("1TB SSD under 50000");
    expect(result.status).toBe("answered");
    expect(result.intent).toBeNull();
    expect(result.cart).toBeNull();
  });

  it("says its opening line, then the model's sentence, and nothing else", async () => {
    const step = lookStep(errandVisiting(trail, AMAZON));
    await step.look(emptyResult("r2", "ssd"), planOf());
    expect(bubbles().map((beat) => beat.text)).toEqual([
      "Opening Amazon now.",
      "Samsung 990 Pro, ₹9,499 on the page.",
    ]);
    // No grey line of the harness's own: every bubble is the agent's.
    expect(bubbles().every((beat) => beat.variant === undefined)).toBe(true);
  });
});

describe("what the model is told before it speaks", () => {
  it("is handed this host's record of the errand, as data", async () => {
    await lookStep(errandVisiting(trail, AMAZON)).look(
      emptyResult("r3", "ssd"),
      planOf(),
    );
    expect(summaryPrompt()).toContain(OBSERVED_MARK);
    expect(summaryPrompt()).toContain("- pages opened: 1 (amazon.in)");
    expect(summaryPrompt()).not.toContain("?k=");
  });

  it("counts only the pages this turn reached, never an earlier turn's", async () => {
    trail.record("https://example.test/earlier");
    await lookStep(errandVisiting(trail, AMAZON)).look(
      emptyResult("r4", "ssd"),
      planOf(),
    );
    expect(summaryPrompt()).toContain("- pages opened: 1 (amazon.in)");
  });

  it("says nothing was opened rather than dropping the sentence", async () => {
    const step = lookStep({
      converse: (prompt: string) => {
        asked.push(prompt);
        return Promise.resolve(answered("I could not reach a page for that."));
      },
    });
    await step.look(emptyResult("r5", "ssd"), planOf());
    expect(summaryPrompt()).toContain("- pages opened: none");
    expect(bubbles().at(-1)?.text).toBe("I could not reach a page for that.");
  });
});

describe("a silent errand is a silent turn", () => {
  it("emits no sentence and no cards when the model said nothing and found nothing", async () => {
    const mute: WebErrand = {
      converse: () =>
        Promise.resolve({
          transcript: [""],
          blocked: [],
          turns: 1,
          completed: true,
        }),
    };
    await lookStep(mute).look(emptyResult("r6", "ssd"), planOf({ reply: "" }));
    expect(hub.snapshot().some((beat) => beat.kind === "message")).toBe(false);
    expect(hub.snapshot().some((beat) => beat.kind === "options")).toBe(false);
  });
});

/**
 * A real Amazon search navigated under the read that followed it, puppeteer
 * threw "Execution context was destroyed", and the whole turn came back
 * `failed`: a stack-trace-shaped outcome where a sentence should have been.
 */
describe("a look that goes wrong is still a turn that answers", () => {
  it("answers rather than failing the run", async () => {
    const broken: WebErrand = {
      converse: () =>
        Promise.reject(new Error("Execution context was destroyed")),
    };
    const result = await lookStep(broken).look(
      emptyResult("r7", "ssd"),
      planOf(),
    );
    expect(result.status).toBe("answered");
    expect(result.failure).toBeNull();
  });

  it("asks the model for the closing line with the pages reached and the break named", async () => {
    let calls = 0;
    const step = lookStep({
      converse: async (prompt: string) => {
        calls += 1;
        asked.push(prompt);
        if (calls === 1) {
          trail.record(AMAZON);
          throw new Error("Execution context was destroyed");
        }
        return answered(
          "The page moved under me; ask again and I will pick it up.",
        );
      },
    });
    await step.look(emptyResult("r8", "ssd"), planOf());
    expect(asked[1]).toContain("- pages opened: 1 (amazon.in)");
    expect(asked[1]).toContain("- clock: this errand stopped early");
    expect(bubbles().at(-1)?.text).toContain("page moved under me");
  });
});
