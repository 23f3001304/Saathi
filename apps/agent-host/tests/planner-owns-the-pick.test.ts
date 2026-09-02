// Whether "go with the Crucial" chooses a card is a reading of a sentence, and
// reading sentences is the model's job. The shell's word-overlap pick ran
// before the planner and, when it fired, drove a checkout the model never
// chose; when it misfired it drove the wrong one.
import type { TurnPlan, TurnPlanner } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import type { WebListingView } from "../src/browser/web-listing.js";
import type { RunnerParts } from "../src/purchase/purchase-runner.js";
import { runnerFor } from "./support/turn-harness.js";

const OFFERED: readonly WebListingView[] = [
  {
    ref: "w1",
    title: "Crucial E100 1TB Portable SSD",
    price_text: "₹15,999",
    price_paise: 1_599_900,
    url: "https://www.amazon.in/x/dp/B0W100000",
    image_url: null,
  },
  {
    ref: "w2",
    title: "SANDISK Extreme 1TB Portable SSD",
    price_text: "₹17,999",
    price_paise: 1_799_900,
    url: "https://www.amazon.in/x/dp/B0W200000",
    image_url: null,
  },
];

const ANSWER: TurnPlan = {
  action: "answer",
  reply: "The Crucial it is.",
  question: null,
  replies: [],
  query: null,
  amendment: null,
  traits: [],
};

describe("a sentence naming a card on the table", () => {
  it("still reaches the planner, which decides what it means", async () => {
    let planned = 0;
    const planner: TurnPlanner = {
      plan: async () => {
        planned += 1;
        return ANSWER;
      },
    };
    const { runner, hub } = runnerFor(ANSWER);
    const parts = (runner as unknown as { parts: RunnerParts }).parts;
    (parts as { planner: TurnPlanner }).planner = planner;
    (parts as { offered: RunnerParts["offered"] }).offered = {
      live: () => OFFERED,
      claim: () => undefined,
    } as unknown as RunnerParts["offered"];

    const result = await runner.run("go with crucial E100", "cnv_1");

    expect(planned).toBe(1);
    expect(result.status).toBe("answered");
    expect(
      hub.snapshot().some((beat) => beat.kind === "message"),
    ).toBe(true);
  });
});
