// One live option set. Re-offering used to swap the rows inside the existing
// block, which left the cards above prose written after them and erased the
// fact that an earlier set had been weighed at all.
import { describe, expect, it } from "vitest";

import { reduceSignals } from "../src/conversation/assistantState.ts";
import type { AssistantSignal } from "../src/conversation/assistantTransport.ts";
import type { OptionRowData } from "../src/conversation/chatScript.ts";

function rows(...skus: readonly string[]): OptionRowData[] {
  return skus.map((sku) => ({
    id: sku,
    sku,
    title: sku,
    pricePaise: 100_000,
    rating: 0,
    deliveryDays: 0,
    merchant: "kolam-run",
  }));
}

function offer(...skus: readonly string[]): AssistantSignal {
  return { kind: "offer", options: rows(...skus) };
}

describe("re-offering folds the set it replaced", () => {
  it("leaves one live set and a line where the last one was", () => {
    const state = reduceSignals([
      offer("a", "b", "c"),
      { kind: "say", text: "Those were not it — here is what else there is." },
      offer("d", "e"),
    ]);

    expect(state.options.map((row) => row.sku)).toEqual(["d", "e"]);
    expect(state.entries).toEqual([
      { kind: "folded", considered: 3 },
      { kind: "agent", text: "Those were not it — here is what else there is." },
      { kind: "offer" },
    ]);
  });

  it("opens the first set without folding anything", () => {
    const state = reduceSignals([offer("a", "b")]);

    expect(state.entries).toEqual([{ kind: "offer" }]);
    expect(state.offering).toBe(true);
  });
});
