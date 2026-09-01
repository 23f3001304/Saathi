// The two rules the harness holds an ordinary turn to, enforced on the commit
// rather than asked for in a prompt: the language they wrote in, and a register
// that says one thing. One gate, one retry, and the research summary exempt
// from the length half — its reasoning is the deliverable.
import type { TurnPlan } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import {
  MAX_SENTENCES,
  overlong,
  restatesRow,
  sentenceCount,
} from "../src/purchase/bubble-register.js";
import { plannedTurn } from "../src/purchase/plan-gate.js";
import { RecordingLogger } from "./support/fakes.js";

const LONG =
  "I found three drives. The SanDisk is ₹19,999. The Crucial is ₹15,499. " +
  "Which do you want?";

const SHORT = "The SanDisk is the one I would buy. Shall I open it?";

function planOf(reply: string): TurnPlan {
  return {
    action: "answer",
    reply,
    question: null,
    replies: [],
    query: null,
    amendment: null,
    traits: [],
  };
}

/** A planner that answers with each reply in turn, and records what it was
 *  told about the attempt before. */
function plannerSaying(...replies: readonly string[]) {
  const corrections: string[] = [];
  return {
    corrections,
    plan: async (
      _stated: readonly string[],
      _language?: string | null,
      correction = "",
    ) => {
      corrections.push(correction);
      return planOf(replies[corrections.length - 1] ?? "");
    },
  };
}

describe("counting what a turn actually said", () => {
  it("does not mistake a price or a rating for the end of a sentence", () => {
    expect(
      sentenceCount("It is ₹1,299 and rated 4.5/5, so I would take it."),
    ).toBe(1);
    expect(sentenceCount("One navy kurta at ₹1,299. What size?")).toBe(2);
    expect(sentenceCount("Sure")).toBe(1);
    expect(sentenceCount("")).toBe(0);
  });

  it("allows two and no more", () => {
    expect(MAX_SENTENCES).toBe(2);
    expect(overlong(SHORT)).toBe(false);
    expect(overlong(LONG)).toBe(true);
  });
});

describe("reading a card row back out", () => {
  const ROWS = ["Kolam Run Gc9 road shoe, UK 8", "Cushioned socks, 3 pack"];

  it("catches the row copied across", () => {
    expect(restatesRow("Kolam Run Gc9 road shoe, UK 8 — ₹1,999.", ROWS)).toBe(
      true,
    );
  });

  it("leaves a sentence that merely names one alone", () => {
    // Reasoning about a product is not reading its row out, and this is the
    // distinction the whole exemption rests on.
    expect(restatesRow("The Kolam Run is the one I would buy.", ROWS)).toBe(
      false,
    );
  });
});

describe("an over-long turn is answered again, not shipped", () => {
  it("retries once with the corrective in front of the same prompt", async () => {
    const planner = plannerSaying(LONG, SHORT);

    const result = await plannedTurn(
      planner,
      ["a navy kurta"],
      null,
      "a navy kurta",
      new RecordingLogger(),
    );

    expect(result.plan.reply).toBe(SHORT);
    expect(result.slipped).toBe(false);
    expect(planner.corrections[0]).toBe("");
    expect(planner.corrections[1]).toContain("two sentences");
  });

  it("commits the second attempt even if it is still long, and says nothing", async () => {
    const planner = plannerSaying(LONG, LONG);

    const result = await plannedTurn(
      planner,
      ["a navy kurta"],
      null,
      "a navy kurta",
      new RecordingLogger(),
    );

    // `slipped` is the language apology and nothing else: a reply that stayed a
    // sentence too long is worse writing, not a broken promise.
    expect(result.plan.reply).toBe(LONG);
    expect(result.slipped).toBe(false);
    expect(planner.corrections).toHaveLength(2);
  });
});

describe("a turn that was already right costs nothing", () => {
  it("asks nothing more of it", async () => {
    const planner = plannerSaying(SHORT);

    const result = await plannedTurn(
      planner,
      ["a navy kurta"],
      null,
      "a navy kurta",
      new RecordingLogger(),
    );

    expect(result.plan.reply).toBe(SHORT);
    expect(planner.corrections).toHaveLength(1);
  });
});
