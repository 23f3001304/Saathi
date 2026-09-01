// Looking inside this shop. The listing is harness-authored — the agent cannot
// describe stock it does not have — but the sentence around it is the model's,
// in whatever language the shopper is using.
import type { TurnPlan } from "@covenant/agents";
import { DEMO_CATALOG } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { BeatHub } from "../src/http/beat-hub.js";
import { browseRows, browseTurn } from "../src/judge/browse-step.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";

const SHOES = {
  action: "browse" as const,
  reply: "Have a look.",
  query: "running shoes",
};

function planOf(over: Partial<TurnPlan>): TurnPlan {
  return {
    action: "browse",
    reply: "",
    question: null,
    query: null,
    amendment: null,
    traits: [],
    ...over,
  };
}

function saidBy(hub: BeatHub): string[] {
  return hub
    .snapshot()
    .filter((beat) => beat.kind === "message")
    .map((beat) => (beat.kind === "message" ? beat.text : ""));
}

function cardsIn(hub: BeatHub) {
  return hub
    .snapshot()
    .flatMap((beat) => (beat.kind === "options" ? beat.options : []));
}

function browsed(over: Partial<TurnPlan>, catalog = DEMO_CATALOG) {
  const hub = new BeatHub(new StepClock(), new RecordingLogger());
  const result = browseTurn(
    {
      hub,
      shelf: { current: () => catalog },
      merchantId: "kolam-run",
      logger: new RecordingLogger(),
    },
    emptyResult("run_1", "running shoes"),
    planOf(over),
  );
  return { hub, result, said: saidBy(hub), cards: cardsIn(hub) };
}

describe("looking is not buying", () => {
  it("shows the shop's rows as cards, priced off the catalog", () => {
    const { cards } = browsed(SHOES);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.pricePaise > 0)).toBe(true);
  });

  it("answers in one bubble and drafts nothing", () => {
    const { result, said } = browsed({ ...SHOES, reply: "Plenty." });
    expect(result.status).toBe("answered");
    expect(result.intent).toBeNull();
    expect(result.cart).toBeNull();
    expect(said).toEqual(["Plenty."]);
  });
});

describe("the cards are the presentation, not the prose", () => {
  /**
   * The agent used to write the same rows out in a sentence directly above
   * them — label, price and category, twice on one screen.
   */
  it("says only the model's own sentence, never the rows underneath it", () => {
    expect(browsed(SHOES).said).toEqual(["Have a look."]);
  });

  it("carries no merchant prose and no price into the bubble", () => {
    const poisoned = DEMO_CATALOG.find((item) => item.sku === "KR-TRAIL-42");
    const { said } = browsed(SHOES);
    expect(said[0]).not.toContain("₹");
    expect(said[0]).not.toContain(poisoned?.description ?? " ");
  });

  it("never invents a rating or a delivery date the catalog does not hold", () => {
    const rows = browseRows(DEMO_CATALOG.slice(0, 2), "kolam-run");
    expect(
      rows.every((row) => row.rating === 0 && row.deliveryDays === 0),
    ).toBe(true);
    expect(rows.every((row) => row.merchant === "kolam-run")).toBe(true);
  });
});

describe("the sentence around the listing is the model's", () => {
  /**
   * The harness used to append "This shop has nothing like that" here. In a
   * Hindi session it was welded, in English, onto the end of the agent's own
   * Hindi sentence and read aloud. The miss now reaches the model as a count
   * on its own tool result, and the model writes the sentence.
   */
  const HINDI = "यहाँ कुछ नहीं है।";

  it("writes no sentence of its own when the shop holds nothing", () => {
    const { said, cards } = browsed(
      { action: "browse", reply: HINDI, query: "ssd" },
      [],
    );
    expect(said).toEqual([HINDI]);
    expect(cards).toEqual([]);
  });
});
