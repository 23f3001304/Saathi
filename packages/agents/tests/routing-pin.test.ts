// An operator naming a model should get that model, without the router being
// reduced to a lookup table: the pin takes the opening rung, and everything
// that makes routing worth having — escalation, the class rules, the block
// matrix — is untouched behind it.
import { describe, expect, it } from "vitest";

import { buildLadder } from "../src/routing/escalation-ladder.js";
import type { CatalogModel } from "../src/routing/model-catalog.js";
import type { ClassRequirements } from "../src/routing/task-classifier.js";

function model(
  id: string,
  costTier: CatalogModel["capabilities"]["costTier"],
): CatalogModel {
  return {
    provider: "openai",
    id,
    capabilities: {
      contextWindow: 200_000,
      toolCalling: true,
      structuredOutput: true,
      vision: false,
      costTier,
      latencyTier: "fast",
    },
  } as CatalogModel;
}

const CATALOG = [
  model("gpt-5-nano", "economy"),
  model("gpt-5", "standard"),
  model("gpt-5.6-luna", "premium"),
];

const REQUIREMENTS = {
  minContextWindow: 8_000,
  toolCalling: true,
  structuredOutput: true,
  minCostTier: "economy",
} as ClassRequirements;

function ladder(pinned?: string): readonly string[] {
  return buildLadder({
    catalog: CATALOG,
    requirements: REQUIREMENTS,
    stats: [],
    maxEscalations: 2,
    pinned: pinned ?? null,
  }).map((m) => m.id);
}

function ladderWith(
  catalog: readonly CatalogModel[],
  requirements: ClassRequirements,
  pinned: string,
): readonly string[] {
  return buildLadder({
    catalog,
    requirements,
    stats: [],
    maxEscalations: 2,
    pinned,
  }).map((m) => m.id);
}

describe("naming the model the operator wants to see", () => {
  it("cold start without a pin is the pure cheapest-first cascade", () => {
    expect(ladder()[0]).toBe("gpt-5-nano");
  });

  it("puts the pinned model on the opening rung", () => {
    expect(ladder("gpt-5.6-luna")[0]).toBe("gpt-5.6-luna");
  });

  // Sorting is cheapest-capable-first, so leaving the rest of the ladder alone
  // made rung two the cheapest model in the catalog: a live run pinned to
  // gpt-5.6-luna escalated to gpt-5-nano, a demotion wearing an escalation's
  // name. Escalation ascends or it is not escalation.
  it("escalates upward from the pin, never back down to something cheaper", () => {
    const rungs = ladder("gpt-5");
    expect(rungs[0]).toBe("gpt-5");
    expect(rungs.slice(1)).not.toContain("gpt-5-nano");
    expect(rungs.slice(1)).toContain("gpt-5.6-luna");
  });

  it("has nowhere to escalate when the pin is already the top rung", () => {
    expect(ladder("gpt-5.6-luna")).toEqual(["gpt-5.6-luna"]);
  });

  it("does not duplicate the pinned model into the ladder twice", () => {
    const rungs = ladder("gpt-5.6-luna");
    expect(new Set(rungs).size).toBe(rungs.length);
  });

  it("ignores a pin no keyed provider can serve", () => {
    expect(ladder("gpt-9-imaginary")[0]).toBe("gpt-5-nano");
  });
});

/** Naming a model is the operator making the judgement the cost floor exists
 *  to make for them. Capabilities are facts and are never waived. */
describe("what a pin may and may not override", () => {
  it("lets a named model clear a class's cost floor", () => {
    const money = {
      ...REQUIREMENTS,
      minCostTier: "standard",
    } as ClassRequirements;
    expect(ladderWith(CATALOG, money, "gpt-5-nano")[0]).toBe("gpt-5-nano");
  });

  it("never lets a pin waive a capability the task needs", () => {
    const base = model("gpt-legacy", "economy");
    const toolless = {
      ...base,
      capabilities: { ...base.capabilities, toolCalling: false },
    };
    const rungs = ladderWith(
      [...CATALOG, toolless],
      REQUIREMENTS,
      "gpt-legacy",
    );
    expect(rungs).not.toContain("gpt-legacy");
  });
});
