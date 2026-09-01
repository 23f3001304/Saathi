// Research is not a performance. The window a look reads through is off the
// shopper's screen; the window a tapped card drives is on it, because that one
// is theirs to take. The phase is a property of the turn, not of the browser.
import type { ConversationResult, TurnPlan } from "@covenant/agents";
import { beforeEach, describe, expect, it } from "vitest";

import { PageReadTimeout, settledRead } from "../src/browser/settled-read.js";
import { WindowPhase } from "../src/browser/window-phase.js";
import { WebFindings } from "../src/browser/web-listing.js";
import { WebTrail } from "../src/browser/web-trail.js";
import { BeatHub } from "../src/http/beat-hub.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { WebLookStep } from "../src/purchase/web-look-step.js";
import { stepLabel } from "../src/purchase/web-steps.js";
import { summariseFor } from "../src/purchase/web-summary.js";
import type { WindowStage } from "../src/purchase/window-stage.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";

function stageSpy(): WindowStage & { moves: string[]; holds: number } {
  const spy = {
    moves: [] as string[],
    holds: 0,
    conceal: () => spy.moves.push("conceal"),
    reveal: () => spy.moves.push("reveal"),
    hold: () => {
      spy.holds += 1;
      return () => {
        spy.holds -= 1;
      };
    },
  };
  return spy;
}

const PLAN: TurnPlan = {
  action: "look_on_web",
  reply: "Opening Amazon now.",
  question: null,
  query: "1TB SSD",
  amendment: null,
  traits: [],
};

function said(text: string): ConversationResult {
  return { transcript: [text], blocked: [], turns: 1, completed: true };
}

let hub: BeatHub;
let trail: WebTrail;

beforeEach(() => {
  hub = new BeatHub(new StepClock(), new RecordingLogger());
  trail = new WebTrail();
});

describe("the window is hidden while the agent is only reading", () => {
  it("conceals the stage before the errand opens anything", async () => {
    const stage = stageSpy();
    const errand = {
      converse: () => {
        // Concealed *before* the first page is opened, not after: a window that
        // flashes onto the screen and vanishes is worse than one that never
        // appeared.
        expect(stage.moves).toEqual(["conceal"]);
        expect(stage.holds).toBe(1);
        trail.record("https://www.amazon.in/s?k=ssd");
        return Promise.resolve(said("The Crucial X9 is ₹15,499 on the page."));
      },
    };
    const step = new WebLookStep(
      hub,
      errand,
      trail,
      new WebFindings(),
      new RecordingLogger(),
      "INR",
      stage,
    );

    await step.look(emptyResult("r1", "an SSD"), PLAN, ["an SSD"]);

    expect(stage.moves).toEqual(["conceal"]);
    // Taken for the errand and given back after it, so the idle sweep can
    // reclaim a window nobody is using once the turn is over.
    expect(stage.holds).toBe(0);
  });
});

describe("a concealed window has nothing to look at", () => {
  it("says so until the phase that hands it over says otherwise", () => {
    const phase = new WindowPhase();

    // Default visible: a window somebody opened deliberately is one they are
    // watching, and every route that existed before this went on working.
    expect(phase.visible).toBe(true);
    phase.conceal();
    expect(phase.visible).toBe(false);
    phase.reveal();
    expect(phase.visible).toBe(true);
  });
});

describe("the agent holding a window counts as somebody being there", () => {
  it("vetoes the idle sweep until the errand lets go", () => {
    const phase = new WindowPhase();
    expect(phase.busy).toBe(false);

    const release = phase.hold();
    const nested = phase.hold();
    expect(phase.busy).toBe(true);
    release();
    expect(phase.busy).toBe(true);
    nested();
    expect(phase.busy).toBe(false);
  });

  it("floors the count, because a stale release must not veto forever", () => {
    const phase = new WindowPhase();
    const release = phase.hold();
    release();
    release();
    expect(phase.busy).toBe(false);
  });
});

describe("a phase with nothing to show is not a phase with nothing to say", () => {
  it("names each move in the harness's own words", () => {
    expect(
      stepLabel("web_open", { url: "https://www.amazon.in/s?k=ssd" }, null),
    ).toBe("Opened amazon.in/s");
    expect(stepLabel("web_read", {}, null)).toBe("Read the page");
    expect(stepLabel("web_search", { query: "1TB SSD" }, null)).toBe(
      "Searched for “1TB SSD”",
    );
    expect(stepLabel("web_fill_address", {}, null)).toBe(
      "Filled the delivery form",
    );
  });

  it("shows a refusal rather than hiding it, and names the cause", () => {
    expect(stepLabel("web_add_to_cart", { ref: "c1" }, "bot_check")).toBe(
      "Put it in the shop's basket · the shop wants a human check",
    );
    // A code the map does not name still reads as a refusal, never a blank.
    expect(stepLabel("web_add_to_cart", { ref: "c1" }, "failed")).toBe(
      "Put it in the shop's basket · did not go through",
    );
  });

  it("says nothing about a tool with nothing worth showing", () => {
    expect(stepLabel("catalog_search", { query: "kurta" }, null)).toBeNull();
  });
});

describe("the summary speaks about what the harness actually captured", () => {
  const TILE = {
    ref: "w1",
    title: "Crucial X9 1TB Portable SSD",
    price_text: "₹15,499",
    price_paise: 1_549_900,
    url: "https://www.amazon.in/CRUCIAL-X9/dp/B0CK778YL5",
    image_url: null,
  };

  it("hands the tiles over as data, so prose and cards cannot disagree", () => {
    const prompt = summariseFor(["an SSD"], null, [TILE]);

    expect(prompt).toContain("Crucial X9 1TB Portable SSD · ₹15,499");
    expect(prompt).toContain("you did not find nothing");
    // Never read the row out: the cards already print it.
    expect(prompt).toContain("never read the list back out");
  });

  it("says nothing was found only when nothing was", () => {
    const prompt = summariseFor(["an SSD"], null, []);

    expect(prompt).toContain("No listing was captured");
    expect(prompt).not.toContain("Crucial");
  });
});

describe("a page that will not be read is abandoned, not waited on", () => {
  it("gives up at the ceiling rather than hanging the run", async () => {
    // A real Amazon product page's `readPage()` returned to nothing at all: no
    // model call in flight, no browser event, and every later sentence queued
    // behind a run that would never end.
    const never = new Promise<never>(() => undefined);
    const session = {
      page: () => ({ readPage: () => never }),
    } as unknown as Parameters<typeof settledRead>[0];
    const waiter = { sleep: async () => undefined };

    await expect(settledRead(session, waiter, 0, 20)).rejects.toThrow(
      PageReadTimeout,
    );
  });
});
