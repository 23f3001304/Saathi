import { describe, expect, it } from "vitest";

import { buildLadder } from "../src/routing/escalation-ladder.js";
import { modelKeyOf } from "../src/routing/model-catalog.js";
import {
  COLD_START_RATE,
  InMemoryRouterStats,
  successRateOf,
} from "../src/routing/outcome-stats.js";
import { requirementsFor } from "../src/routing/task-classifier.js";
import { extractFeatures } from "../src/routing/task-features.js";
import {
  FOUR,
  ladderFor,
  LUNA,
  OPENAI_ONLY,
  PROSE_ONLY,
  RETRIEVAL,
} from "./routing-fixtures.js";

async function statsAfter(accepted: boolean, times: number) {
  const stats = new InMemoryRouterStats();
  for (let i = 0; i < times; i += 1) {
    await stats.observe({
      taskClass: "retrieval",
      modelKey: modelKeyOf(LUNA),
      accepted,
      confidence: accepted ? 0.9 : 0.1,
    });
  }
  return stats.snapshot("retrieval");
}

describe("cold start", () => {
  it("gives every model the same prior", () => {
    expect(successRateOf(undefined)).toBe(COLD_START_RATE);
  });

  it("orders the ladder cheapest first when nothing has been observed", () => {
    expect(ladderFor("search the catalog").map((rung) => rung.id)).toEqual([
      "gpt-5.6-luna",
      "gpt-5.6-terra",
      "gpt-5.6-sol",
    ]);
  });

  it("caps the ladder at one start plus two escalations", () => {
    expect(ladderFor("search the catalog", [], FOUR)).toHaveLength(3);
  });
});

describe("admissibility", () => {
  it("drops a model that cannot meet the class requirements", () => {
    const features = extractFeatures(RETRIEVAL);
    const rungs = buildLadder({
      catalog: [...OPENAI_ONLY, PROSE_ONLY],
      // The prose-only rung declares no structured output.
      requirements: requirementsFor("negotiation", features),
      stats: [],
      maxEscalations: 5,
    });
    expect(rungs.map(modelKeyOf)).not.toContain("openai:gpt-5-nano-prose");
  });
});

describe("online learning", () => {
  it("pushes a repeatedly failing cheap model up a tier", async () => {
    const rungs = ladderFor("search the catalog", await statsAfter(false, 4));
    expect(rungs[0]?.id).toBe("gpt-5.6-terra");
  });

  it("keeps the demoted model on the ladder rather than striking it off", async () => {
    const rungs = ladderFor("search the catalog", await statsAfter(false, 4));
    expect(rungs.map((rung) => rung.id)).toContain("gpt-5.6-luna");
  });

  it("keeps a model that keeps succeeding at the front", async () => {
    const rungs = ladderFor("search the catalog", await statsAfter(true, 4));
    expect(rungs[0]?.id).toBe("gpt-5.6-luna");
  });

  it("does not demote on one bad turn: the floor needs evidence", async () => {
    const rungs = ladderFor("search the catalog", await statsAfter(false, 1));
    expect(rungs[0]?.id).toBe("gpt-5.6-luna");
  });
});
