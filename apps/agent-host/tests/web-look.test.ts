// Looking on the open web, as a terminal outcome of a turn. The failure this
// path exists to kill: "I'll look for SSDs on Amazon" followed by the local
// fixture catalog — cushioned socks and three navy kurtas — five turns running.
import type { ConversationResult, TurnPlan } from "@covenant/agents";
import { beforeEach, describe, expect, it } from "vitest";

import { WebFindings } from "../src/browser/web-listing.js";
import { WebTrail } from "../src/browser/web-trail.js";
import { BeatHub } from "../src/http/beat-hub.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import type { WebErrand } from "../src/purchase/web-look-step.js";
import { WebLookStep } from "../src/purchase/web-look-step.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";

const AMAZON = "https://www.amazon.in/s?k=1tb+ssd";

/** How the page is named to a person: host and path, never the query. */
// The provenance line names the shop and counts the pages; the full slugs
// live on the window card's journal, where they can be read.
const AMAZON_NAMED = "1 page on amazon.in";

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

/** An errand that walks the sandbox, writing the trail `WebShopper` writes. */
function errandVisiting(trail: WebTrail, ...urls: string[]) {
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
    .filter((beat) => beat.kind === "message")
    .map((beat) => (beat.kind === "message" ? beat : null));
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

  it("reports the page it actually landed on, with its provenance", async () => {
    const step = lookStep(errandVisiting(trail, AMAZON));
    await step.look(emptyResult("r2", "ssd"), planOf());
    const said = bubbles();
    expect(said[0]?.text).toBe("Opening Amazon now.");
    expect(said[1]?.text).toContain("Samsung 990 Pro");
    expect(said[2]?.text).toContain(AMAZON_NAMED);
    expect(said[2]?.text).not.toContain("?k=");
    expect(said[2]?.text).toContain("never a signed quote");
  });
});

describe("what the harness says and what the agent says", () => {
  /**
   * The closing line is the harness speaking, not the agent, so it goes out as
   * a system statement — the same channel the cart refusals use — rather than
   * welded onto the end of a sentence the model wrote.
   */
  it("marks the harness's own sentence as the harness's", async () => {
    const step = lookStep(errandVisiting(trail, AMAZON));
    await step.look(emptyResult("r3", "ssd"), planOf());
    const said = bubbles();
    expect(said[1]?.variant).toBeUndefined();
    expect(said[2]?.variant).toBe("system");
  });

  it("says plainly that no signed price means no settlement here", async () => {
    const step = lookStep(errandVisiting(trail, AMAZON));
    await step.look(emptyResult("r4", "ssd"), planOf());
    const last = bubbles().at(-1)?.text ?? "";
    expect(last).toContain("payment step");
    // Nothing was read that could become a card, so nothing is promised as
    // one: see `web-options.test.ts` for the line a turn with cards closes on.
    expect(last).not.toContain("Tap one");
  });
});

/** The invariant, enforced from the record of the act rather than the model's
 *  account of it: a claim with no navigation behind it is never shown. */
describe("the agent never claims a page it did not open", () => {
  const inventing = {
    converse: () =>
      Promise.resolve(answered("I found a 1TB SSD on Amazon for ₹4,499.")),
  };

  it("drops the findings and says so when nothing was opened", async () => {
    const step = lookStep(inventing);
    await step.look(emptyResult("r5", "ssd"), planOf());
    const said = bubbles().map((beat) => beat?.text ?? "");
    expect(said.some((text) => text.includes("₹4,499"))).toBe(false);
    expect(said.at(-1)).toContain("could not get a page open");
  });

  it("counts only the pages this turn reached, never an earlier turn's", async () => {
    trail.record("https://example.test/earlier");
    const step = lookStep(inventing);
    await step.look(emptyResult("r6", "ssd"), planOf());
    expect(bubbles().at(-1)?.text).toContain("could not get a page open");
  });
});

/**
 * A real Amazon search navigated under the read that followed it, puppeteer
 * threw "Execution context was destroyed", and the whole turn came back
 * `failed` — a stack-trace-shaped outcome where a sentence should have been.
 */
describe("a look that goes wrong is still a turn that answers", () => {
  const broken = {
    converse: () =>
      Promise.reject(
        new Error(
          "Execution context was destroyed, most likely because of a navigation.",
        ),
      ),
  };

  it("answers rather than failing the run", async () => {
    const step = lookStep(broken);
    const result = await step.look(emptyResult("r7", "ssd"), planOf());
    expect(result.status).toBe("answered");
    expect(result.failure).toBeNull();
  });

  it("still names the page it reached, and does not invent what was on it", async () => {
    const step = lookStep({
      converse: async () => {
        trail.record(AMAZON);
        throw new Error("Execution context was destroyed");
      },
    });
    await step.look(emptyResult("r8", "ssd"), planOf());
    const said = bubbles().map((beat) => beat?.text ?? "");
    expect(said.some((text) => text.includes("page moved under me"))).toBe(
      true,
    );
    expect(said.at(-1)).toContain(AMAZON_NAMED);
  });
});
