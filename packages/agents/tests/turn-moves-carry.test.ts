// What each move carries now that the model chooses it: the skus to put on
// the screen, the draft the sheet will print, the ref of a card they named.
// A move the shelf or the cap refuses records nothing and comes back as a
// tool error the model can act on inside the same turn.
import { describe, expect, it } from "vitest";

import { DEMO_CATALOG } from "../src/merchant/demo-catalog.js";
import {
  BROWSE_TOOL,
  BUYER_TOOL_SERVER,
  PICK_TOOL,
  PROPOSE_TOOL,
} from "../src/buyer/turn-plan.js";
import { TurnPlanCollector } from "../src/buyer/turn-plan-collector.js";

const BOUNDS = {
  capPaise: 250_000,
  currency: "INR",
  shelf: { current: () => DEMO_CATALOG },
};

function boundCollector(): TurnPlanCollector {
  return new TurnPlanCollector(undefined, null, BOUNDS);
}

async function dispatched(
  collector: TurnPlanCollector,
  tool: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const outcome = await collector.dispatch({
    tool,
    server: BUYER_TOOL_SERVER,
    args,
  });
  return { ...JSON.parse(outcome.content), isError: outcome.isError };
}

describe("a browse names the rows the model read", () => {
  it("records the skus and tells the model the cards are on screen", async () => {
    const collector = boundCollector();
    const body = await dispatched(collector, BROWSE_TOOL, {
      reply: "Have a look.",
      skus: ["ST-KURTA-NAVY-M", "AG-KURTA-NAVY-M"],
    });
    expect(body).toMatchObject({ recorded: "browse", shown: 2, isError: false });
    expect(collector.take()).toMatchObject({
      action: "browse",
      skus: ["ST-KURTA-NAVY-M", "AG-KURTA-NAVY-M"],
    });
  });

  it("refuses a sku the shelf does not hold, with the shelf attached, and records nothing", async () => {
    const collector = boundCollector();
    const body = await dispatched(collector, BROWSE_TOOL, {
      reply: "Have a look.",
      skus: ["NOT-HERE"],
    });
    expect(body).toMatchObject({
      failure: "sku_not_on_shelf",
      unknown: ["NOT-HERE"],
      isError: true,
    });
    expect(body["shelf"]).toContain("ST-KURTA-NAVY-M");
    expect(collector.take()).toBeNull();
  });

  it("refuses a browse that names no sku at all", async () => {
    const collector = boundCollector();
    const body = await dispatched(collector, BROWSE_TOOL, { reply: "Look." });
    expect(body).toMatchObject({ failure: "bad_arguments", isError: true });
    expect(collector.take()).toBeNull();
  });
});

const PROPOSAL = {
  reply: "Drafting that now.",
  sku: "ST-KURTA-NAVY-M",
  max_amount_paise: 200_000,
  requires_refundability: true,
  description: "a navy cotton kurta, M, at most 2000 rupees",
};

describe("a proposal carries the draft", () => {
  it("records the draft the sheet will show", async () => {
    const collector = boundCollector();
    const body = await dispatched(collector, PROPOSE_TOOL, PROPOSAL);
    expect(body).toMatchObject({ recorded: "draft_intent", isError: false });
    expect(collector.take()).toMatchObject({
      action: "draft_intent",
      reply: "Drafting that now.",
      draft: {
        sku: "ST-KURTA-NAVY-M",
        maxAmountPaise: 200_000,
        requiresRefundability: true,
        description: "a navy cotton kurta, M, at most 2000 rupees",
      },
    });
  });
});

/** A refusal hands back the one fact the retry needs and never a number of
 *  the shell's own: the model proposes again, inside the same turn. */
describe("a proposal the bounds refuse", () => {
  it("refuses a ceiling above the cap, names the cap, and records nothing", async () => {
    const collector = boundCollector();
    const body = await dispatched(collector, PROPOSE_TOOL, {
      ...PROPOSAL,
      max_amount_paise: 250_001,
    });
    expect(body).toMatchObject({
      failure: "cap_exceeded",
      cap_paise: 250_000,
      isError: true,
    });
    expect(collector.take()).toBeNull();
  });

  it("refuses a sku off the shelf with the shelf attached", async () => {
    const collector = boundCollector();
    const body = await dispatched(collector, PROPOSE_TOOL, {
      ...PROPOSAL,
      sku: "NOT-HERE",
    });
    expect(body).toMatchObject({ failure: "sku_not_on_shelf", isError: true });
    expect(body["shelf"]).toContain("ST-KURTA-NAVY-M");
    expect(collector.take()).toBeNull();
  });
});

describe("a pick names a card", () => {
  it("records the ref", async () => {
    const collector = new TurnPlanCollector();
    const body = await dispatched(collector, PICK_TOOL, {
      reply: "Going with the Crucial.",
      ref: "w1",
    });
    expect(body).toMatchObject({ recorded: "pick", isError: false });
    expect(collector.take()).toMatchObject({ action: "pick", ref: "w1" });
  });

  it("refuses an empty ref and records nothing", async () => {
    const collector = new TurnPlanCollector();
    const body = await dispatched(collector, PICK_TOOL, { reply: "Going." });
    expect(body).toMatchObject({ failure: "bad_arguments", isError: true });
    expect(collector.take()).toBeNull();
  });
});
