// Compaction as the planner actually feels it: a long chat reaches the model
// as the verbatim tail plus one stored summary line in the digest — never as
// the whole transcript replayed, and never with the oldest lines simply gone.
import type { TurnPlan, TurnPlanner } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import type { Turn } from "../src/purchase/dialogue.js";
import { PurchaseRunner } from "../src/purchase/purchase-runner.js";
import { mapLog, recorderRig, RUN_CONFIG, stillParts } from "./support/context-rig.js";

const CHAT = "cnv_long_a";

function at(index: number): string {
  return new Date(Date.parse("2026-08-31T08:00:00Z") + index * 1000)
    .toISOString();
}

/** A conversation already long enough that replaying it verbatim is the bug. */
class LongConversation {
  private readonly turns: Turn[];
  private clock: number;

  constructor(seeded: number) {
    this.turns = Array.from({ length: seeded }, (_, index) => ({
      speaker: index % 2 === 0 ? ("user" as const) : ("agent" as const),
      text: `line number ${index}`,
      at: at(index),
    }));
    this.clock = seeded;
  }

  async remember(text: string): Promise<null> {
    return this.push("user", text);
  }

  async rememberAgent(text: string): Promise<null> {
    return this.push("agent", text);
  }

  async recall(): Promise<readonly Turn[]> {
    return this.turns;
  }

  private push(speaker: Turn["speaker"], text: string): null {
    this.turns.push({ speaker, text, at: at(this.clock) });
    this.clock += 1;
    return null;
  }
}

function answering(): TurnPlan {
  return {
    action: "answer",
    reply: "Okay.",
    question: null,
    query: null,
    amendment: null,
    traits: [],
  };
}

function longRig() {
  const tables = recorderRig(mapLog());
  const seen: { lines: readonly string[]; context: string }[] = [];
  const planner: TurnPlanner = {
    plan: async (lines, _lang, _note, context = "") => {
      seen.push({ lines, context });
      return answering();
    },
  };
  const parts = {
    ...stillParts(),
    planner,
    conversation: new LongConversation(26),
    offered: tables.offered,
    context: tables.recorder,
  };
  const runner = new PurchaseRunner(parts as never, RUN_CONFIG);
  return { runner, recorder: tables.recorder, seen };
}

describe("what a long chat looks like to the planner", () => {
  it("replays only the unfolded tail, verbatim, once a fold is stored", async () => {
    const { runner, seen } = longRig();
    await runner.run("what else is there", CHAT);
    await runner.run("and anything smaller", CHAT);
    // First turn: nothing folded yet, the whole recall goes through.
    expect(seen[0]?.lines.length).toBe(27);
    // Second turn: the fold from turn one holds; only the tail replays.
    expect(seen[1]?.lines.length).toBeLessThan(15);
    expect(seen[1]?.lines.join("\n")).not.toContain("line number 0");
    expect(seen[1]?.lines.join("\n")).toContain("and anything smaller");
  });

  it("carries the folded lines in the digest, marked as a summary", async () => {
    const { runner, recorder, seen } = longRig();
    await runner.run("what else is there", CHAT);
    await runner.run("and anything smaller", CHAT);
    expect(recorder.current()?.summary).toContain("(them) line number 0");
    expect(seen[1]?.context).toContain("earlier dialogue, compacted ·");
    expect(seen[1]?.context).toContain("line number 0");
  });
});
