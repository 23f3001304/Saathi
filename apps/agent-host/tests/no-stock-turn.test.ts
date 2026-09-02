// What a turn does when the shop stocks nothing the shopper asked for: it says
// so, it looks somewhere that might, and it signs nothing on the way.
import type { TurnPlan } from "@covenant/agents";
import { beforeEach, describe, expect, it } from "vitest";

import { BeatHub } from "../src/http/beat-hub.js";
import { noStockTurn, SPOKE_TOO_SOON } from "../src/judge/no-stock-step.js";
import type { PurchaseResult } from "../src/purchase/purchase-result.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";

const SSD = "do you have a 1tb ssd";

class RecordingWebLook {
  readonly asked: string[] = [];
  readonly anchors: readonly string[][] = [];

  look(
    base: PurchaseResult,
    plan: TurnPlan,
    stated: readonly string[] = [],
  ): Promise<PurchaseResult> {
    this.asked.push(plan.query ?? base.request);
    (this.anchors as string[][]).push([...stated]);
    return Promise.resolve({
      ...base,
      status: "answered",
      transcript: ["Amazon lists a 1TB NVMe at 6,499."],
    });
  }
}

let hub: BeatHub;
let webLook: RecordingWebLook;
let base: PurchaseResult;

beforeEach(() => {
  hub = new BeatHub(new StepClock(), new RecordingLogger());
  webLook = new RecordingWebLook();
  base = emptyResult("urn:covenant:run:1", SSD);
});

/** Nothing already on the table and nothing streamed: the plain path, where
 *  the shop cannot serve it and the open web has not been tried yet. */
function bare() {
  return { offered: { live: () => [] }, drafts: null, chat: "cnv_1" };
}

function run(): Promise<PurchaseResult> {
  return noStockTurn(
    { hub, webLook, logger: new RecordingLogger(), ...bare() },
    base,
    SSD,
  );
}

describe("the turn a shop with nothing to sell produces", () => {
  it("adds no canned harness sentence: the errand speaks for the turn", async () => {
    // The fixed "this shop doesn't stock that" surfaced in conversations
    // where it answered nothing; the transition is the model's to say now,
    // in the shopper's own language, from the errand's summary leg.
    await run();
    const said = hub.snapshot().filter((beat) => beat.kind === "message");
    expect(said).toEqual([]);
  });

  it("drafts nothing and asks for no signature", async () => {
    await run();
    const kinds = hub.snapshot().map((beat) => beat.kind);
    expect(kinds).not.toContain("intent-draft");
    expect(kinds).not.toContain("signing-required");
    expect(kinds).not.toContain("intent-signed");
  });

  it("looks on the open web for the thing that was actually asked for", async () => {
    await run();
    expect(webLook.asked).toEqual([SSD]);
  });

  it("ends the run answered, with the errand's own words", async () => {
    const result = await run();
    expect(result.status).toBe("answered");
    expect(result.failure).toBeNull();
    expect(result.transcript[0]).toBe("Amazon lists a 1TB NVMe at 6,499.");
  });
});

describe("what the errand is told the shopper wrote", () => {
  it("hands over every line they wrote, not just the last one", async () => {
    await noStockTurn(
      { hub, webLook, logger: new RecordingLogger(), ...bare() },
      emptyResult("urn:covenant:run:1", "50,000rs"),
      `${SSD}
50,000rs`,
    );
    expect(webLook.anchors[0]).toEqual([SSD, "50,000rs"]);
  });
});

const FOUND = {
  ref: "w3",
  title: "Crucial E100 1TB Portable SSD",
  price_text: "₹15,999",
  price_paise: 1_599_900,
  url: "https://www.amazon.in/CRUCIAL-E100/dp/B0D1XYZ123",
  image_url: null,
};

function withCards() {
  const drafts = { withdrawn: [] as string[] };
  return {
    hub,
    webLook,
    logger: new RecordingLogger(),
    chat: "cnv_1",
    offered: { live: () => [FOUND] },
    drafts: {
      withdrawLast: (reason: string) => drafts.withdrawn.push(reason),
    },
    withdrawn: drafts.withdrawn,
  };
}

describe("a shop that cannot serve it, when the web already has", () => {
  it("still hands the turn to the errand, whose known block holds the cards", async () => {
    // The re-present used to answer "none of these" with the same four
    // cards. The errand reads the known block and judges: answer from it,
    // offer it again, or search fresh. Routing is no longer the harness's
    // word-list to get wrong.
    const parts = withCards();

    const result = await noStockTurn(parts, base, SSD);

    expect(webLook.anchors).toHaveLength(1);
    expect(result.status).toBe("answered");
  });

  it("withdraws the streamed draft that promised a purchase", async () => {
    const parts = withCards();
    await noStockTurn(parts, base, SSD);
    expect(parts.withdrawn).toEqual([SPOKE_TOO_SOON]);
  });
});
