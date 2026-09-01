import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_ESCALATIONS } from "../src/routing/escalation-ladder.js";
import {
  DEFAULT_ROUTER_CONFIG,
  NoCandidateModelError,
} from "../src/routing/model-router.js";
import {
  CONFIDENT,
  RETRIEVAL,
  routerOf,
  ScriptedAttempts,
  TERRA,
  UNCERTAIN,
} from "./routing-fixtures.js";

function cheapOnly() {
  return new ScriptedAttempts({ "openai:gpt-5.6-luna": CONFIDENT });
}

function escalating() {
  return new ScriptedAttempts({
    "openai:gpt-5.6-luna": UNCERTAIN,
    "openai:gpt-5.6-terra": CONFIDENT,
  });
}

function stubborn() {
  return new ScriptedAttempts({
    "openai:gpt-5.6-luna": UNCERTAIN,
    "openai:gpt-5.6-terra": UNCERTAIN,
    "openai:gpt-5.6-sol": UNCERTAIN,
  });
}

describe("stopping early", () => {
  it("stops on the cheapest model when its confidence clears the threshold", async () => {
    const runner = cheapOnly();
    const { router, decisions } = routerOf();
    const result = await router.route(RETRIEVAL, runner);
    expect(runner.seen).toEqual(["openai:gpt-5.6-luna"]);
    expect(result.model.id).toBe("gpt-5.6-luna");
    expect(decisions[0]?.escalations).toBe(0);
    expect(decisions[0]?.capped).toBe(false);
  });

  it("considers the whole ladder even when it runs only the first rung", async () => {
    const { router, decisions } = routerOf();
    await router.route(RETRIEVAL, cheapOnly());
    expect(decisions[0]?.candidates).toEqual([
      "openai:gpt-5.6-luna",
      "openai:gpt-5.6-terra",
      "openai:gpt-5.6-sol",
    ]);
  });
});

describe("escalating", () => {
  it("climbs one rung when the cheap answer scores below the threshold", async () => {
    const runner = escalating();
    const { router } = routerOf();
    const result = await router.route(RETRIEVAL, runner);
    expect(runner.seen).toEqual([
      "openai:gpt-5.6-luna",
      "openai:gpt-5.6-terra",
    ]);
    expect(result.model.id).toBe("gpt-5.6-terra");
  });

  it("writes down the score and the signal that caused the climb", async () => {
    const { router, decisions } = routerOf();
    await router.route(RETRIEVAL, escalating());
    const decision = decisions[0];
    expect(decision?.escalations).toBe(1);
    expect(decision?.attempts[0]?.escalatedBecause).toBe(
      "confidence 0.00 < 0.62, weakest signal languageCertainty",
    );
    expect(decision?.attempts[1]?.accepted).toBe(true);
  });

  it("feeds each rung's outcome back into the statistics", async () => {
    const { router, stats } = routerOf();
    await router.route(RETRIEVAL, escalating());
    const rows = await stats.snapshot("retrieval");
    expect(rows.find((row) => row.modelKey.endsWith("luna"))?.accepted).toBe(0);
    expect(rows.find((row) => row.modelKey.endsWith("terra"))?.accepted).toBe(
      1,
    );
  });
});

describe("the cap", () => {
  it("stops a pathological turn from walking past the escalation budget", async () => {
    const runner = stubborn();
    const { router } = routerOf();
    await router.route(RETRIEVAL, runner);
    expect(runner.seen).toHaveLength(DEFAULT_MAX_ESCALATIONS + 1);
  });

  it("marks the decision capped and says the ladder ran out", async () => {
    const { router, decisions } = routerOf();
    await router.route(RETRIEVAL, stubborn());
    expect(decisions[0]?.capped).toBe(true);
    expect(decisions[0]?.attempts.at(-1)?.escalatedBecause).toBe(
      "ladder exhausted, no rung left to climb",
    );
  });
});

describe("the record", () => {
  it("carries the class, the choice, the threshold and each component", async () => {
    const { router, decisions } = routerOf();
    await router.route(RETRIEVAL, cheapOnly());
    const decision = decisions[0];
    expect(decision?.taskClass).toBe("retrieval");
    expect(decision?.chosen).toBe("openai:gpt-5.6-luna");
    expect(decision?.threshold).toBe(DEFAULT_ROUTER_CONFIG.threshold);
    expect(decision?.attempts[0]?.components.map((part) => part.name)).toEqual([
      "languageCertainty",
    ]);
  });

  it("names the class when no keyed model can hold the turn", async () => {
    const { router } = routerOf([]);
    await expect(
      router.route(RETRIEVAL, new ScriptedAttempts({})),
    ).rejects.toThrow(NoCandidateModelError);
  });
});

describe("self-consistency", () => {
  it("takes a second cheap sample on a money turn", async () => {
    const runner = new ScriptedAttempts({ "openai:gpt-5.6-terra": CONFIDENT });
    const { router } = routerOf([TERRA]);
    await router.route(
      {
        prompt: "buy the brass lamp",
        availableTools: ["mcp__covenant_gateway__execute_payment"],
        requiresStructuredOutput: true,
      },
      runner,
    );
    expect(runner.seen).toEqual([
      "openai:gpt-5.6-terra",
      "openai:gpt-5.6-terra",
    ]);
  });

  it("takes only one sample on a retrieval turn", async () => {
    const runner = cheapOnly();
    const { router } = routerOf();
    await router.route(RETRIEVAL, runner);
    expect(runner.seen).toHaveLength(1);
  });
});
