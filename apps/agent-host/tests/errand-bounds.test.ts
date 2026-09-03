// An errand ends. Whatever went wrong and wherever, the turn closes honestly
// with what was captured — because a turn that cannot end blocks the queue,
// and the shopper cannot even ask something else.
import type { ConversationResult } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { withinCall, ToolCallTimeout } from "../src/purchase/call-ceiling.js";
import { runErrand } from "../src/purchase/errand-run.js";
import { WebToolRunner } from "../src/purchase/web-tool-runner.js";
import type { WebShopper } from "../src/browser/web-shopper.js";
import { RecordingLogger } from "./support/fakes.js";

const NEVER = new Promise<never>(() => undefined);

function said(text: string): ConversationResult {
  return { transcript: [text], blocked: [], turns: 1, completed: true };
}

function promptsFor() {
  return {
    look: "go",
    summarise: () => "say",
  };
}

describe("a sandbox call that stops answering is a tool result", () => {
  it("gives the model something to route around", async () => {
    // `page.evaluate` on a dead target is waited on without limit. Auditing
    // each browser call would leave the next one added unguarded, so the bound
    // sits at the one place every sandbox call passes through.
    const shopper = { read: () => NEVER } as unknown as WebShopper;
    const runner = new WebToolRunner(shopper, null, null, 20);

    const outcome = await runner.run({
      tool: "web_read",
      server: "covenant_web",
      args: {},
    });

    expect(outcome.isError).toBe(true);
    expect(JSON.parse(outcome.content)).toMatchObject({
      ok: false,
      failure: "page_unreachable",
    });
  });

  it("still writes the move down, so the shopper sees the refusal", async () => {
    const steps: string[] = [];
    const shopper = { read: () => NEVER } as unknown as WebShopper;
    const runner = new WebToolRunner(
      shopper,
      null,
      { step: (label) => steps.push(label) },
      20,
    );

    await runner.run({ tool: "web_read", server: "covenant_web", args: {} });

    expect(steps).toEqual(["Read the page · the page stopped answering"]);
  });
});

describe("the ceiling names what it gave up on", () => {
  it("names the tool", async () => {
    await expect(withinCall(NEVER, "web_search", 10)).rejects.toThrow(
      ToolCallTimeout,
    );
  });
});

describe("an errand that runs past its wall clock closes anyway", () => {
  it("reports the expiry rather than waiting on the leg that hung", async () => {
    const errand = { converse: () => NEVER };

    const run = await runErrand(
      errand,
      promptsFor(),
      new RecordingLogger(),
      20,
    );

    expect(run.expired).toBe(true);
    expect(run.told).toBe("");
    // Not a failure: nothing broke, the errand ran out of clock.
    expect(run.failure).toBeNull();
  });

  it("abandons the conversation it stopped awaiting", async () => {
    let reset = 0;
    const errand = {
      converse: () => NEVER,
      reset: async () => {
        reset += 1;
      },
    };

    await runErrand(errand, promptsFor(), new RecordingLogger(), 20);

    // Once at the opening — one errand, one conversation — and once more when
    // the clock runs out, so the half-finished turn nobody awaited is not the
    // opening of the next question's.
    expect(reset).toBe(2);
  });
});

describe("an errand that finishes in time is left completely alone", () => {
  it("keeps its sentence, and starts from a clean conversation", async () => {
    let reset = 0;
    const errand = {
      converse: () => Promise.resolve(said("The Crucial X9 is ₹15,499.")),
      reset: async () => {
        reset += 1;
      },
    };

    const run = await runErrand(
      errand,
      promptsFor(),
      new RecordingLogger(),
      5_000,
    );

    expect(run.expired).toBe(false);
    expect(run.told).toBe("The Crucial X9 is ₹15,499.");
    // The opening reset, and no second one: nothing was abandoned.
    expect(reset).toBe(1);
  });
});
