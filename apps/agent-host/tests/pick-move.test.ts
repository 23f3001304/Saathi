// The model read the cards on their screen through see_state and named one.
// The host takes the same path a tap on that card takes; a ref that is on no
// card leaves the model's own sentence standing, and nothing is driven.
import type { TurnPlan } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import type { WebListingView } from "../src/browser/web-listing.js";
import { BeatHub } from "../src/http/beat-hub.js";
import { pickTurn } from "../src/purchase/pick-step.js";
import type { PurchaseResult } from "../src/purchase/purchase-result.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { RecordingLogger, SeqIds, StepClock } from "./support/fakes.js";

const CARD: WebListingView = {
  ref: "w1",
  title: "Crucial E100 1TB",
  price_text: "₹6,199",
  price_paise: 619_900,
  url: "https://www.amazon.in/dp/B0D1XYZ123",
  image_url: null,
};

/** The model's own sentence about a ref that is on no card. */
const NO_SANDISK =
  "I do not see a SanDisk on your screen; the cards are Crucial only.";

function planOf(over: Partial<TurnPlan>): TurnPlan {
  return {
    action: "pick",
    reply: "Going with the Crucial.",
    question: null,
    query: null,
    amendment: null,
    traits: [],
    ...over,
  };
}

function rig(
  offered: readonly WebListingView[],
  rebuilt: PurchaseResult | null = null,
) {
  const hub = new BeatHub(new StepClock(), new RecordingLogger());
  const bought: string[] = [];
  const reproposed: string[] = [];
  const parts = {
    hub,
    offered: { current: () => offered },
    webPick: {
      buy: async (ref: string): Promise<PurchaseResult> => {
        bought.push(ref);
        return { ...emptyResult("pick", ref), status: "answered" };
      },
    },
    repropose: async (ref: string): Promise<PurchaseResult | null> => {
      reproposed.push(ref);
      return rebuilt;
    },
    ids: new SeqIds(),
    logger: new RecordingLogger(),
  };
  return { hub, parts, bought, reproposed };
}

describe("naming a card in words is choosing it", () => {
  it("drives the web errand for a ref on their screen", async () => {
    const { parts, bought, reproposed } = rig([CARD]);
    const result = await pickTurn(
      parts,
      emptyResult("r1", "go with the crucial"),
      planOf({ ref: "w1" }),
      ["go with the crucial"],
      null,
    );
    expect(bought).toEqual(["w1"]);
    expect(reproposed).toEqual([]);
    expect(result.status).toBe("answered");
  });

  it("rebuilds the cart for a platform sku when a proposal stands", async () => {
    const rebuilt: PurchaseResult = {
      ...emptyResult("pick", "NF-KURTA-NAVY-M"),
      status: "bounded",
    };
    const { parts, bought, reproposed } = rig([], rebuilt);
    const result = await pickTurn(
      parts,
      emptyResult("r2", "the nilgiri one"),
      planOf({ ref: "NF-KURTA-NAVY-M" }),
      ["the nilgiri one"],
      null,
    );
    expect(reproposed).toEqual(["NF-KURTA-NAVY-M"]);
    expect(bought).toEqual([]);
    expect(result).toBe(rebuilt);
  });
});

describe("a ref on no card", () => {
  it("drives nothing and lets the model's own sentence stand", async () => {
    const { hub, parts, bought } = rig([CARD]);
    const result = await pickTurn(
      parts,
      emptyResult("r3", "the sandisk"),
      planOf({ ref: "w9", reply: NO_SANDISK }),
      ["the sandisk"],
      null,
    );
    const shown = hub.snapshot().find((beat) => beat.kind === "message");
    const settled = hub.snapshot().find((beat) => beat.kind === "outcome");
    expect(bought).toEqual([]);
    expect(shown).toMatchObject({ text: NO_SANDISK });
    expect(settled).toMatchObject({ state: "answered", detail: "pick_unknown" });
    expect(result.status).toBe("answered");
    expect(result.transcript).toEqual([NO_SANDISK]);
  });
});

// Both fields filled, and the question used to be read first and alone: the
// sentence that said what happened never reached the transcript at all.
describe("a ref on no card, answered and asked about at once", () => {
  it("says the reply and still puts the question at the composer", async () => {
    const { hub, parts } = rig([CARD]);
    const result = await pickTurn(
      parts,
      emptyResult("r5", "the sandisk"),
      planOf({
        ref: "w9",
        reply: "That card is gone.",
        question: "Which one did you mean?",
      }),
      ["the sandisk"],
      null,
    );
    const beats = hub.snapshot();
    expect(beats.find((beat) => beat.kind === "message")).toMatchObject({
      text: "That card is gone.",
    });
    expect(beats.find((beat) => beat.kind === "question")).toMatchObject({
      prompt: "Which one did you mean?",
    });
    expect(result.transcript).toEqual([
      "That card is gone.",
      "Which one did you mean?",
    ]);
  });
});

describe("a ref on no card, where the sentence is the question", () => {
  it("puts the model's question at the composer when it asked which", async () => {
    const { hub, parts } = rig([CARD]);
    await pickTurn(
      parts,
      emptyResult("r4", "the crucial"),
      planOf({
        ref: "w9",
        reply: "Two of those are Crucial. Which one?",
        replies: ["E100", "X9"],
      }),
      ["the crucial"],
      null,
    );
    const asked = hub.snapshot().find((beat) => beat.kind === "question");
    expect(asked).toMatchObject({
      prompt: "Two of those are Crucial. Which one?",
      replies: ["E100", "X9"],
    });
  });
});
