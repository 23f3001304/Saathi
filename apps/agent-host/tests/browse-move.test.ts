// Looking inside this shop. The model read the shelf through see_shelf and
// named the rows it would show; the cards are built from those rows at the
// shop's own prices, and the sentence around them is the model's.
import type { TurnPlan } from "@covenant/agents";
import { DEMO_CATALOG } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { BeatHub } from "../src/http/beat-hub.js";
import { browseRows, browseTurn } from "../src/judge/browse-step.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { RecordingLogger, SeqIds, StepClock } from "./support/fakes.js";

const KURTAS = {
  action: "browse" as const,
  reply: "Have a look.",
  skus: ["NF-KURTA-NAVY-M", "ST-KURTA-NAVY-M"],
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
      ids: new SeqIds(),
      logger: new RecordingLogger(),
    },
    emptyResult("run_1", "navy kurtas"),
    planOf(over),
  );
  return { hub, result, said: saidBy(hub), cards: cardsIn(hub) };
}

describe("looking is not buying", () => {
  it("shows exactly the rows the model named, in its order, priced off the catalog", () => {
    const { cards } = browsed(KURTAS);
    expect(cards.map((card) => card.sku)).toEqual([
      "NF-KURTA-NAVY-M",
      "ST-KURTA-NAVY-M",
    ]);
    expect(cards.map((card) => card.pricePaise)).toEqual([141_000, 129_900]);
  });

  it("answers in one bubble and drafts nothing", () => {
    const { result, said } = browsed({ ...KURTAS, reply: "Plenty." });
    expect(result.status).toBe("answered");
    expect(result.intent).toBeNull();
    expect(result.cart).toBeNull();
    expect(said).toEqual(["Plenty."]);
  });
});

describe("the cards are the presentation, not the prose", () => {
  it("says only the model's own sentence, never the rows underneath it", () => {
    expect(browsed(KURTAS).said).toEqual(["Have a look."]);
  });

  it("carries no merchant prose and no price into the bubble", () => {
    const anchored = DEMO_CATALOG.find((item) => item.sku === "AG-KURTA-NAVY-M");
    const { said } = browsed({ ...KURTAS, skus: ["AG-KURTA-NAVY-M"] });
    expect(said[0]).not.toContain("₹");
    expect(said[0]).not.toContain(anchored?.description ?? " ");
  });

  it("never invents a rating or a delivery date the catalog does not hold", () => {
    const rows = browseRows(DEMO_CATALOG.slice(0, 2), "kolam-run");
    expect(
      rows.every((row) => row.rating === 0 && row.deliveryDays === 0),
    ).toBe(true);
    expect(rows.every((row) => row.merchant === "kolam-run")).toBe(true);
  });
});

describe("the shelf is the record", () => {
  it("skips a sku the shelf does not hold rather than inventing a row", () => {
    // The collector already refused this; the skip here is the defensive
    // half of one rule, never a second judgement about the model's words.
    const { cards } = browsed({ ...KURTAS, skus: ["NOT-HERE", "ST-KURTA-NAVY-M"] });
    expect(cards.map((card) => card.sku)).toEqual(["ST-KURTA-NAVY-M"]);
  });

  it("shows no cards and says only the model's sentence when it named none", () => {
    const HINDI = "यहाँ कुछ नहीं है।";
    const { said, cards } = browsed({ action: "browse", reply: HINDI, skus: [] });
    expect(said).toEqual([HINDI]);
    expect(cards).toEqual([]);
  });
});
