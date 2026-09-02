// The sentence about an abandoned errand is the model's too: a turn that ran
// out of clock, or broke, still closes on prose written with the facts in
// front of it, and on nothing at all when even that cannot be had.
import type { ConversationResult } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import type { ErrandPrompts, WebErrand } from "../src/purchase/errand-run.js";
import { runErrand, sayOnly } from "../src/purchase/errand-run.js";
import type { ErrandEnd } from "../src/purchase/observed-block.js";
import { RecordingLogger } from "./support/fakes.js";

const NEVER = new Promise<never>(() => undefined);

function said(text: string): ConversationResult {
  return { transcript: [text], blocked: [], turns: 1, completed: true };
}

/** Records how each summary leg was told the errand ended. */
function promptsFor(ends: ErrandEnd[] = []) {
  return {
    look: "go",
    summarise: (ended: ErrandEnd) => {
      ends.push(ended);
      return `say ${ended.expired ? "expired" : "finished"}`;
    },
  };
}

/** A conversation whose first leg stalls or breaks and whose second speaks. */
function twoLegged(
  first: () => Promise<ConversationResult>,
  then: string,
): WebErrand {
  let calls = 0;
  return {
    converse: () => {
      calls += 1;
      return calls === 1 ? first() : Promise.resolve(said(then));
    },
  };
}

/** `runErrand` with the logger none of these cases reads back. */
function ran(errand: WebErrand, prompts: ErrandPrompts, ceilingMs: number) {
  return runErrand(errand, prompts, new RecordingLogger(), ceilingMs);
}

/**
 * The sentence about an abandoned errand is the model's, on a fresh
 * conversation that knows only what this host observed. The harness used to
 * say "I ran out of time on that one" in its own fixed English.
 */
describe("an abandoned errand is still asked for one sentence", () => {
  it("asks once after the clock ran out, and keeps what the model said", async () => {
    const ends: ErrandEnd[] = [];
    const errand = twoLegged(
      () => NEVER,
      "The shop stopped answering me partway.",
    );

    const run = await ran(errand, promptsFor(ends), 20);

    expect(run.expired).toBe(true);
    expect(run.told).toBe("The shop stopped answering me partway.");
    expect(ends).toEqual([{ expired: true, failure: null }]);
  });

  it("names the break, not the clock, when a leg threw", async () => {
    const ends: ErrandEnd[] = [];
    const errand = twoLegged(
      () => Promise.reject(new Error("Execution context was destroyed")),
      "The page moved under me.",
    );

    const run = await ran(errand, promptsFor(ends), 5_000);

    expect(run.expired).toBe(false);
    expect(run.failure).toBe("Execution context was destroyed");
    expect(run.told).toBe("The page moved under me.");
    expect(ends).toEqual([
      { expired: false, failure: "Execution context was destroyed" },
    ]);
  });
});

describe("the afterword is bounded like the errand it closes", () => {
  it("closes with no sentence when even that sentence hangs", async () => {
    const errand = { converse: () => NEVER };

    const run = await ran(errand, promptsFor(), 20);

    expect(run.expired).toBe(true);
    expect(run.told).toBe("");
  });

  it("abandons the hung conversation before asking it anything", async () => {
    const order: string[] = [];
    let calls = 0;
    const errand = {
      converse: () => {
        calls += 1;
        order.push(`converse${calls}`);
        return calls === 1 ? NEVER : Promise.resolve(said("Stopped."));
      },
      reset: async () => {
        order.push("reset");
      },
    };

    await ran(errand, promptsFor(), 20);

    expect(order).toEqual(["reset", "converse1", "reset", "converse2"]);
  });
});

describe("one sentence and nothing else", () => {
  it("returns the model's last line, bounded by its own clock", async () => {
    const errand = { converse: () => Promise.resolve(said("Just this.")) };
    expect(await sayOnly(errand, "speak", 1_000)).toBe("Just this.");
  });

  it("returns nothing when the turn hangs or throws", async () => {
    expect(await sayOnly({ converse: () => NEVER }, "speak", 20)).toBe("");
    expect(
      await sayOnly(
        { converse: () => Promise.reject(new Error("x")) },
        "speak",
        20,
      ),
    ).toBe("");
  });
});
