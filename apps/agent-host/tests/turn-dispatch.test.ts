// The fork every turn passes through. Two moves reached this point built but
// unreachable — the runner only knew "purchase or answer" — so these assert
// what each move now does, and that only one of the seven can reach `buy`.
import type { TraitClaim, TurnPlan } from "@covenant/agents";
import { beforeEach, describe, expect, it } from "vitest";

import type { BeatHub } from "../src/http/beat-hub.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import type { TurnParts } from "../src/purchase/turn-step.js";
import { nonPurchaseTurn } from "../src/purchase/turn-step.js";
import type {
  RecordingPick,
  RecordingTraits,
  RecordingWebLook,
} from "./support/dispatch-parts.js";
import { dispatchRig } from "./support/dispatch-parts.js";

let traits: RecordingTraits;
let webLook: RecordingWebLook;
let webPick: RecordingPick;
let hub: BeatHub;
let parts: TurnParts;

function planOf(over: Partial<TurnPlan>): TurnPlan {
  return { action: "answer", reply: "Right you are.", question: null, ...over };
}

function said(): readonly string[] {
  return hub
    .snapshot()
    .filter((beat) => beat.kind === "message")
    .map((beat) => (beat.kind === "message" ? beat.text : ""));
}

beforeEach(() => {
  ({ parts, hub, traits, webLook, webPick } = dispatchRig());
});

describe("only a purchase reaches the money path", () => {
  it("lets draft_intent through, and nothing else", async () => {
    const carried = await nonPurchaseTurn(
      parts,
      emptyResult("r1", "buy shoes"),
      planOf({ action: "draft_intent" }),
    );
    expect(carried).toBeNull();
  });

  it("answers a browse without signing or drafting anything", async () => {
    const result = await nonPurchaseTurn(
      parts,
      emptyResult("r2", "what shoes do you have"),
      planOf({ action: "browse", skus: ["RUN-RED-8"] }),
    );
    expect(result?.status).toBe("answered");
    expect(result?.intent).toBeNull();
  });

  it("answers an amendment proposal rather than acting on it", async () => {
    const result = await nonPurchaseTurn(
      parts,
      emptyResult("r3", "raise my cap"),
      planOf({ action: "propose_amendment", reply: "Here is the change." }),
    );
    expect(result?.status).toBe("answered");
    expect(result?.intent).toBeNull();
  });
});

function cards() {
  return hub
    .snapshot()
    .flatMap((beat) => (beat.kind === "options" ? beat.options : []));
}

describe("a browse is read off the catalog, never off merchant prose", () => {
  it("names what is in the shop, with the price the catalog holds", async () => {
    await nonPurchaseTurn(
      parts,
      emptyResult("r4", "shoes"),
      planOf({
        action: "browse",
        skus: ["RUN-RED-8"],
        reply: "Have a look.",
      }),
    );
    expect(cards()).toEqual([
      {
        id: "RUN-RED-8",
        sku: "RUN-RED-8",
        title: "Trailfoot Runner",
        pricePaise: 349_900,
        rating: 0,
        deliveryDays: 0,
        merchant: "kolam-run",
      },
    ]);
  });

  it("carries no merchant description into the bubble", async () => {
    await nonPurchaseTurn(
      parts,
      emptyResult("r5", "shoes"),
      planOf({ action: "browse", skus: ["RUN-RED-8"] }),
    );
    expect(said()[0] ?? "").not.toContain("IGNORE PREVIOUS INSTRUCTIONS");
  });
});

/**
 * The move the whole change exists for. Looking somewhere else is terminal
 * here, beside a browse: it reaches the sandbox and it drafts nothing, so
 * "show me what Amazon has" never puts a mandate in front of anyone.
 */
describe("looking on the open web is its own outcome of a turn", () => {
  it("goes, and drafts no intent to get there", async () => {
    const result = await nonPurchaseTurn(
      parts,
      emptyResult("r8", "search amazon for a 1TB SSD under 50000"),
      planOf({ action: "look_on_web", query: "1TB SSD under 50000" }),
    );
    expect(webLook.asked).toEqual(["1TB SSD under 50000"]);
    expect(result?.status).toBe("answered");
    expect(result?.intent).toBeNull();
  });

  it("is never reached from a browse, which stays inside this shop", async () => {
    await nonPurchaseTurn(
      parts,
      emptyResult("r9", "search amazon for ssd"),
      planOf({ action: "browse", skus: [] }),
    );
    expect(webLook.asked).toEqual([]);
  });
});

describe("what the shopper said about themselves", () => {
  const HEARD: readonly TraitClaim[] = [{ key: "shoe_size", value: "UK 8" }];

  it("is remembered on a conversational turn", async () => {
    await nonPurchaseTurn(
      parts,
      emptyResult("r6", "I wear UK 8"),
      planOf({ traits: HEARD }),
    );
    expect(traits.kept).toEqual(HEARD);
  });

  it("is remembered on the turn that becomes a purchase too", async () => {
    await nonPurchaseTurn(
      parts,
      emptyResult("r7", "UK 8, buy me runners"),
      planOf({ action: "draft_intent", traits: HEARD }),
    );
    expect(traits.kept).toEqual(HEARD);
  });
});

describe("a pick is the card's own path, never a purchase", () => {
  it("drives the web errand for a ref on the screen and drafts nothing", async () => {
    const result = await nonPurchaseTurn(
      parts,
      emptyResult("r10", "go with the crucial"),
      planOf({ action: "pick", ref: "w1" }),
    );
    expect(webPick.bought).toEqual(["w1"]);
    expect(result?.status).toBe("answered");
    expect(result?.intent).toBeNull();
  });

  it("never falls through to buy on a ref nobody can resolve", async () => {
    const result = await nonPurchaseTurn(
      parts,
      emptyResult("r11", "the sandisk"),
      planOf({ action: "pick", ref: "w9", reply: "No SanDisk on your screen." }),
    );
    expect(result).not.toBeNull();
    expect(webPick.bought).toEqual([]);
  });
});
