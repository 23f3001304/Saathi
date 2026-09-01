// Only what the agent *says* becomes a bubble. A structured reply that reached
// this channel once put a raw intent draft — currency, paise ceiling and all —
// into a shopper's chat as though the agent had said it.
import type { CatalogListing } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { BeatHub } from "../src/http/beat-hub.js";
import type { DecisionJournal } from "../src/obs/decision-journal.js";
import { RunNarrator } from "../src/purchase/run-narrator.js";
import { ToolLog } from "../src/purchase/tool-log.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";

describe("what the agent says is prose", () => {
  function narratedFor(transcript: readonly string[]): readonly string[] {
    const hub = new BeatHub(new StepClock(), new RecordingLogger());
    new RunNarrator(hub, new ToolLog(), {
      ofKind: () => [],
    } as unknown as DecisionJournal).replay({
      transcript,
      blocked: [],
      turns: 1,
      completed: true,
    });
    return hub
      .snapshot()
      .filter((beat) => beat.kind === "message")
      .map((beat) => (beat.kind === "message" ? beat.text : ""));
  }

  it("keeps a sentence", () => {
    expect(narratedFor(["I found four kurtas under your cap."])).toEqual([
      "I found four kurtas under your cap.",
    ]);
  });

  it("drops a bare JSON payload rather than rendering it as a bubble", () => {
    expect(
      narratedFor([
        '{"natural_language_description":"hi","max_amount_paise":0,"currency":"USD"}',
      ]),
    ).toEqual([]);
  });

  it("drops a bare array too, and keeps prose that merely mentions braces", () => {
    expect(narratedFor(["[1,2,3]"])).toEqual([]);
    expect(narratedFor(["The quote came back as {price} per unit."])).toEqual([
      "The quote came back as {price} per unit.",
    ]);
  });
});

/**
 * The one path where the model has actually *seen* the listings: it called
 * `catalog_search` itself. So it is the one path that can read the table back
 * out, above the cards printing the same rows at the same prices.
 */
const LISTING = {
  sku: "sku_shoe",
  label: "Kolam Run Gc9 road shoe, UK 8",
  category: "footwear",
  merchant_id: "kolam-run",
  list_price_paise: 199_900,
  currency: "INR",
  refundable: true,
  in_stock: true,
  description: { value: "A shoe.", tier: "P0" },
  image_url: null,
} as unknown as CatalogListing;

function narratedWithRows(transcript: readonly string[]): readonly string[] {
  const hub = new BeatHub(new StepClock(), new RecordingLogger());
  const log = new ToolLog();
  log.recordListings([LISTING]);
  new RunNarrator(
    hub,
    log,
    { ofKind: () => [] } as unknown as DecisionJournal,
    new RecordingLogger(),
  ).replay({ transcript, blocked: [], turns: 1, completed: true });
  return hub
    .snapshot()
    .filter((beat) => beat.kind === "message")
    .map((beat) => (beat.kind === "message" ? beat.text : ""));
}

describe("the bubble does not re-read the table under it", () => {
  it("drops a line that copies a row across", () => {
    expect(
      narratedWithRows([
        "Kolam Run Gc9 road shoe, UK 8 — ₹1,999 (footwear).",
        "It is refundable, so I can take it all the way.",
      ]),
    ).toEqual(["It is refundable, so I can take it all the way."]);
  });
});

describe("reasoning about a product is not reading its row out", () => {
  it("keeps a line that reasons about the same thing", () => {
    expect(
      narratedWithRows(["The Kolam Run is the only one that fits your cap."]),
    ).toEqual(["The Kolam Run is the only one that fits your cap."]);
  });
});
