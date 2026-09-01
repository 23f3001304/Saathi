// The live shelf holds one navy cotton kurta and one cotton-silk stole. A live
// turn read it correctly — `items:2` — and then told the shopper there were
// "two matching navy cotton kurtas in size M; which one should I prepare?",
// and that sentence is what was committed and stored. The shelf is a record; a
// sentence counting it is checkable against it.
import type { CatalogSku } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { matchCatalog } from "../src/judge/catalog-match.js";
import { miscountsShelf } from "../src/judge/shelf-claim.js";
import { BeatHub } from "../src/http/beat-hub.js";
import { answerTurn, MISCOUNTED_SHELF } from "../src/purchase/answer-step.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";

function row(sku: string, label: string): CatalogSku {
  return {
    sku,
    label,
    category: "uncategorised",
    listPricePaise: 129900,
    currency: "INR",
    floorPricePaise: 129900,
    refundable: false,
    stock: 4,
    description: "",
    imageUrl: null,
  };
}

const LIVE_SHELF: readonly CatalogSku[] = [
  row("item_TWNIHOyaam98x4", "Navy cotton kurta, M"),
  row("item_TWO4GVGhCE5lwW", "Nilgiri handloom stole, cotton-silk"),
];

const INVENTED =
  "There are two matching navy cotton kurtas in size M; which one should I " +
  "prepare within your ₹2,000 budget?";

describe("one shared word is not a match", () => {
  it("does not answer a kurta query with a cotton-silk stole", () => {
    const found = matchCatalog(LIVE_SHELF, "navy cotton kurta");

    expect(found.map((item) => item.sku)).toEqual(["item_TWNIHOyaam98x4"]);
  });

  it("still returns every row that ties at the top", () => {
    const shelf = [
      row("A", "Navy cotton kurta, M"),
      row("B", "Navy cotton kurta, M (Acme)"),
    ];

    expect(matchCatalog(shelf, "navy cotton kurta")).toHaveLength(2);
  });
});

describe("a sentence that counts the shop is checked against it", () => {
  it("catches the second kurta that does not exist", () => {
    expect(miscountsShelf(LIVE_SHELF, INVENTED)).toBe(true);
  });

  it("passes the same sentence with the true count", () => {
    expect(
      miscountsShelf(LIVE_SHELF, "There is one matching navy cotton kurta."),
    ).toBe(false);
  });

  it("reads a budget, a size and a pack quantity as none of its business", () => {
    expect(
      miscountsShelf(LIVE_SHELF, "Up to 2,000 rupees for the kurta."),
    ).toBe(false);
    expect(miscountsShelf(LIVE_SHELF, "The UK 8 navy cotton kurta.")).toBe(
      false,
    );
    expect(miscountsShelf(LIVE_SHELF, "A 3 pack of navy cotton kurta.")).toBe(
      false,
    );
  });

  it("says nothing about counts it cannot check against the shelf", () => {
    expect(miscountsShelf(LIVE_SHELF, "I found two matching options.")).toBe(
      false,
    );
    expect(miscountsShelf([], INVENTED)).toBe(false);
  });
});

function answered(reply: string) {
  const hub = new BeatHub(new StepClock(), new RecordingLogger());
  const result = answerTurn(
    {
      hub,
      shelf: { current: () => LIVE_SHELF },
      ids: { uuid: () => "ask-1" },
      logger: new RecordingLogger(),
    },
    emptyResult("r1", "buy a navy kurta"),
    {
      action: "answer",
      reply,
      question: null,
      query: null,
      amendment: null,
      traits: [],
    },
  );
  // A turn that ends by asking commits its one utterance as a `question` beat,
  // which is what arms the composer; anything else is a `message`.
  const said = hub.snapshot().flatMap((beat) => {
    if (beat.kind === "message") return [beat.text];
    return beat.kind === "question" ? [beat.prompt] : [];
  });
  return { result, said };
}

describe("a turn that miscounts the shop is not published", () => {
  it("drops the invented listing rather than committing it", () => {
    const { said, result } = answered(INVENTED);

    expect(said).toEqual([MISCOUNTED_SHELF]);
    expect(result.transcript).toEqual([MISCOUNTED_SHELF]);
    expect(said[0]).not.toContain("two");
  });

  it("leaves a truthful sentence exactly as the model wrote it", () => {
    const truthful = "I found one navy cotton kurta at ₹1,299. Shall I?";

    expect(answered(truthful).said).toEqual([truthful]);
  });
});
