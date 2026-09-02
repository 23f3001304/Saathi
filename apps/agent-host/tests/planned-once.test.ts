// The plan the model returns is the turn. The gates that re-planned it over
// its language or its length asked the model twice and, when the second
// answer disagreed too, printed a shell sentence apologising for the model.
// Here a Hindi reply to an English line goes out as written, once.
import type { TurnPlan, TurnPlanner } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { runnerFor } from "./support/turn-harness.js";

const HINDI: TurnPlan = {
  action: "answer",
  reply: "Main aapke liye dekh raha hoon, aap kitna kharch karna chahte hain?",
  question: null,
  replies: [],
  query: null,
  amendment: null,
  traits: [],
};

function countingPlanner(plan: TurnPlan): TurnPlanner & { calls: number } {
  const planner = {
    calls: 0,
    plan: async () => {
      planner.calls += 1;
      return plan;
    },
  };
  return planner;
}

describe("the planner is asked once", () => {
  it("commits the plan it returns, whatever language it came back in", async () => {
    const planner = countingPlanner(HINDI);
    const { runner, hub } = runnerFor(HINDI);
    // The harness's planner is replaced with one that counts.
    (runner as unknown as { parts: { planner: TurnPlanner } }).parts.planner =
      planner;

    await runner.run("a navy kurta under 2000", "cnv_1", "en");

    expect(planner.calls).toBe(1);
    const said = hub
      .snapshot()
      .flatMap((beat) => {
        if (beat.kind === "message") return [beat];
        return beat.kind === "question" ? [{ text: beat.prompt }] : [];
      });
    expect(said.map((beat) => beat.text)).toEqual([HINDI.reply]);
    expect(
      hub.snapshot().some(
        (beat) => beat.kind === "message" && beat.variant === "system",
      ),
    ).toBe(false);
  });
});
