import type { TurnPlan } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { browseTurn } from "../src/judge/browse-step.js";
import { BeatHub } from "../src/http/beat-hub.js";
import { splitAsk } from "../src/purchase/ask-step.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { RecordingLogger, SeqIds, StepClock } from "./support/fakes.js";

/**
 * The shell enforces the shape; the model only proposes one. Every case below
 * drives a *misbehaving* plan — one that asks and acts in the same breath, or
 * answers in a language nobody asked for — and asserts what the harness did
 * with it. None of them need a model, which is the point: the enforcement is
 * provable without one.
 */

const SHELF = [
  {
    sku: "sku_kurta_navy",
    label: "Navy cotton kurta",
    category: "apparel",
    listPricePaise: 129_900,
    currency: "INR",
    refundable: true,
    stock: 4,
    description: "A kurta.",
    imageUrl: null,
  },
];

function browseParts(hub: BeatHub) {
  return {
    hub,
    shelf: { current: () => SHELF },
    merchantId: "kolam-run",
    ids: new SeqIds(),
    logger: new RecordingLogger(),
  };
}

function planOf(reply: string): TurnPlan {
  return {
    action: "browse",
    reply,
    question: null,
    replies: ["Small", "Medium", "Large"],
    query: "navy kurta",
    amendment: null,
    traits: [],
  };
}

describe("an ACT turn that ends by asking is split, never left dangling", () => {
  it("says the report, renders the evidence, then arms the composer", () => {
    const hub = new BeatHub(new StepClock(), new RecordingLogger());
    const result = browseTurn(
      browseParts(hub),
      emptyResult("r1", "a navy kurta"),
      planOf("One navy kurta here at ₹1,299. What size do you need?"),
    );

    const kinds = hub.snapshot().map((beat) => beat.kind);
    // Bubble, then cards, then the ask. Never an ask above the evidence.
    expect(kinds).toEqual(["message", "options", "question", "outcome"]);
    const asked = hub.snapshot().find((beat) => beat.kind === "question");
    expect(asked).toMatchObject({
      prompt: "What size do you need?",
      replies: ["Small", "Medium", "Large"],
    });
    const said = hub.snapshot().find((beat) => beat.kind === "message");
    expect(said).toMatchObject({ text: "One navy kurta here at ₹1,299." });
    expect(result.status).toBe("answered");
  });

  it("leaves a turn that asked nothing exactly as it was", () => {
    const hub = new BeatHub(new StepClock(), new RecordingLogger());
    browseTurn(
      browseParts(hub),
      emptyResult("r1", "a navy kurta"),
      planOf("One navy kurta here at ₹1,299."),
    );
    expect(hub.snapshot().map((beat) => beat.kind)).toEqual([
      "message",
      "options",
      "outcome",
    ]);
  });

});

describe("splitting a reply into what it reported and what it asked", () => {
  it("keeps a reply that is nothing but its question whole", () => {
    expect(splitAsk("What size do you need?")).toEqual({
      said: "What size do you need?",
      question: null,
    });
  });
});
