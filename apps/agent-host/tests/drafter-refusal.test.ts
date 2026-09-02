// The harness used to answer a drafter that found nothing on the shelf by
// starting a web errand the model never chose. Until the draft is the model's
// own (Stage 3), a refusal simply ends the run: nothing is said for the model,
// and nothing is driven on its behalf.
import type { TurnPlan } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { NothingStocked } from "../src/session/catalog-match.js";
import { inertContext } from "../src/purchase/context-record.js";
import type { RunnerParts } from "../src/purchase/purchase-runner.js";
import { PurchaseRunner } from "../src/purchase/purchase-runner.js";
import { RUN_CONFIG, stillParts } from "./support/context-rig.js";
import { forbidden, plannerSaying } from "./support/turn-harness.js";

const DRAFT: TurnPlan = {
  action: "draft_intent",
  reply: "",
  question: null,
  replies: [],
  query: null,
  amendment: null,
  traits: [],
};

describe("a drafter that names nothing", () => {
  it("ends the run failed, drives no errand, and says nothing for the model", async () => {
    const still = stillParts();
    const parts = {
      ...still,
      planner: plannerSaying(DRAFT),
      offered: { live: () => [], claim: () => undefined },
      context: inertContext(),
      drafts: null,
      intents: {
        sign: () => Promise.reject(new NothingStocked("do you have a 1tb ssd")),
      },
      webLook: forbidden("webLook"),
    } as unknown as RunnerParts;
    const runner = new PurchaseRunner(parts, RUN_CONFIG);

    const result = await runner.run("do you have a 1tb ssd", "cnv_1");

    expect(result.status).toBe("failed");
    expect(result.failure).toBe("this shop stocks nothing matching the request");
    expect(
      still.hub.snapshot().some((beat) => beat.kind === "message"),
    ).toBe(false);
  });
});
