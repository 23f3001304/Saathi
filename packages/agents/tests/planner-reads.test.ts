// The planner's two eyes. A read records nothing and reaches nothing, so the
// hook lets it through and the model may look before it moves.
import { describe, expect, it } from "vitest";

import { MoneyToolRegistry } from "../src/buyer/money-tool-registry.js";
import type {
  AppState,
  PlannerReads,
  ShelfSight,
} from "../src/buyer/planner-reads.js";
import { PLANNER_READ_TOOLS } from "../src/buyer/planner-reads.js";
import {
  ANSWER_TOOL,
  BUYER_TOOL_SERVER,
  SEE_SHELF_TOOL,
  SEE_STATE_TOOL,
} from "../src/buyer/turn-plan.js";
import { TurnPlanCollector } from "../src/buyer/turn-plan-collector.js";
import { TURN_PLAN_TOOLS } from "../src/buyer/turn-plan-tools.js";
import { wireNameOf } from "../src/providers/tool-declarations.js";

describe("the two reads", () => {
  it("are declared on the buyer's own server and take no arguments", () => {
    expect(PLANNER_READ_TOOLS.map((tool) => tool.tool)).toEqual([
      SEE_SHELF_TOOL,
      SEE_STATE_TOOL,
    ]);
    for (const tool of PLANNER_READ_TOOLS) {
      expect(tool.server).toBe(BUYER_TOOL_SERVER);
      expect(tool.parameters).toMatchObject({ type: "object" });
      expect(tool.parameters["required"] ?? []).toEqual([]);
    }
  });

  it("sit beside the moves in the planner's tool list", () => {
    const names = TURN_PLAN_TOOLS.map((tool) => tool.tool);
    expect(names).toContain(SEE_SHELF_TOOL);
    expect(names).toContain(SEE_STATE_TOOL);
  });

  it("are non-money, so the hook lets a look through", () => {
    const registry = new MoneyToolRegistry();
    expect(registry.isMoneyAffecting(SEE_SHELF_TOOL)).toBe(false);
    expect(registry.isMoneyAffecting(SEE_STATE_TOOL)).toBe(false);
  });

  it("reach every provider under the same wire name", () => {
    expect(PLANNER_READ_TOOLS.map(wireNameOf)).toEqual([
      "mcp__covenant_buyer__see_shelf",
      "mcp__covenant_buyer__see_state",
    ]);
  });
});

const SHELF: ShelfSight = {
  merchant: "kolam-run",
  rows: [
    {
      sku: "ASC-GC9-UK8",
      label: "Kolam Run Gc9 road shoe, UK 8",
      category: "footwear",
      list_price_paise: 199_900,
      currency: "INR",
      image_url: null,
    },
  ],
};

const STATE: AppState = {
  language_setting: "hi",
  on_screen: { options: [], picked: null },
  checkout: null,
  covenant: {
    bounds: [{ predicate: "max_amount", value: 250_000 }],
    merchants: [],
    skus: [],
    envelopes: [],
    blackout: null,
    pending_signature: null,
  },
  sign_ins: [{ host: "amazon.in", username: "asha@example.com" }],
  earlier_dialogue_summary: null,
};

const reads: PlannerReads = {
  shelf: () => Promise.resolve(SHELF),
  state: () => Promise.resolve(STATE),
};

function read(collector: TurnPlanCollector, tool: string) {
  return collector.dispatch({ tool, server: BUYER_TOOL_SERVER, args: {} });
}

describe("looking before moving", () => {
  it("hands the shelf back as JSON and records no move", async () => {
    const collector = new TurnPlanCollector(undefined, reads);
    const outcome = await read(collector, SEE_SHELF_TOOL);
    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content)).toEqual(SHELF);
    expect(collector.take()).toBeNull();
  });

  it("hands the state back, and the move made after it is the plan", async () => {
    const collector = new TurnPlanCollector(undefined, reads);
    const seen = await read(collector, SEE_STATE_TOOL);
    expect(JSON.parse(seen.content)).toEqual(STATE);
    await collector.dispatch({
      tool: ANSWER_TOOL,
      server: BUYER_TOOL_SERVER,
      args: { reply: "You have a sign-in stored for amazon.in." },
    });
    expect(collector.take()?.action).toBe("answer");
  });
});

describe("a look with nothing to see", () => {
  it("refuses a read on a host that wired none, rather than answering with an empty world", async () => {
    const outcome = await read(new TurnPlanCollector(), SEE_SHELF_TOOL);
    expect(outcome.isError).toBe(true);
    expect(JSON.parse(outcome.content)).toEqual({
      ok: false,
      failure: "no_reads",
    });
  });

  it("turns a read that throws into a tool error the model can see", async () => {
    const broken: PlannerReads = {
      shelf: () => Promise.resolve(SHELF),
      state: () => Promise.reject(new Error("gateway unreachable")),
    };
    const outcome = await read(new TurnPlanCollector(undefined, broken), SEE_STATE_TOOL);
    expect(outcome.isError).toBe(true);
    expect(JSON.parse(outcome.content)).toEqual({
      ok: false,
      failure: "read_failed",
      detail: "gateway unreachable",
    });
  });
});
