import { describe, expect, it } from "vitest";

import {
  TURN_PLAN_CONTEXT_MARK,
  TURN_PLAN_PROMPT,
  turnPlanClosing,
} from "../src/buyer/turn-plan-prompt.js";
import {
  SessionTurnPlanner,
  TurnPlanCollector,
} from "../src/buyer/turn-planner.js";
import { ScriptedSession, say } from "./doubles.js";
import { RecordingLogger } from "./fakes.js";

const TRANSCRIPT = ["[them] navy kurta under 2000", "[you] Which size?"];

async function composedFor(stated: readonly string[]): Promise<string> {
  const session = new ScriptedSession([say("ok")]);
  const planner = new SessionTurnPlanner(
    session,
    new TurnPlanCollector(),
    new RecordingLogger(),
  );
  await planner.plan(stated);
  return session.seen[0]?.userMessage ?? "";
}

describe("where the binding rules sit in the planner's prompt", () => {
  it("puts the conversation between the instructions and the closing", async () => {
    const composed = await composedFor(TRANSCRIPT);
    const closing = turnPlanClosing(TRANSCRIPT[TRANSCRIPT.length - 1] ?? "");
    expect(composed.startsWith(TURN_PLAN_PROMPT)).toBe(true);
    expect(composed.endsWith(closing)).toBe(true);
    for (const line of TRANSCRIPT) {
      expect(composed.indexOf(line)).toBeGreaterThan(TURN_PLAN_PROMPT.length);
      expect(composed.indexOf(line)).toBeLessThan(composed.indexOf(closing));
    }
  });

  it("routes on the shopper's own words, not on the block around them", async () => {
    const session = new ScriptedSession([say("ok")]);
    const planner = new SessionTurnPlanner(
      session,
      new TurnPlanCollector(),
      new RecordingLogger(),
    );
    await planner.plan(TRANSCRIPT);
    expect(session.seen[0]?.subject).toBe(TRANSCRIPT.join("\n"));
  });
});

describe("where the working context sits in the prompt", () => {
  const DIGEST = "found on the open web, already on their screen:\n- Crucial E100 — ₹6,199 — https://www.amazon.in/dp/B0D1XYZ123 (ref w1)";

  async function planned(context: string): Promise<string> {
    const session = new ScriptedSession([say("ok")]);
    const planner = new SessionTurnPlanner(
      session,
      new TurnPlanCollector(),
      new RecordingLogger(),
    );
    await planner.plan(TRANSCRIPT, null, "", context);
    return session.seen[0]?.userMessage ?? "";
  }

  it("injects the digest after the transcript and before the closing", async () => {
    const composed = await planned(DIGEST);
    const mark = composed.indexOf(TURN_PLAN_CONTEXT_MARK);
    const closing = composed.indexOf("TWO THINGS DECIDE THIS TURN");
    expect(mark).toBeGreaterThan(composed.indexOf(TRANSCRIPT[1] ?? ""));
    expect(mark).toBeLessThan(composed.indexOf(DIGEST));
    expect(composed.indexOf(DIGEST)).toBeLessThan(closing);
  });

  it("keeps the prompt in its original shape when there is no record", async () => {
    const composed = await planned("");
    expect(composed).not.toContain(TURN_PLAN_CONTEXT_MARK);
  });
});

describe("what the closing rules say", () => {
  const closing = turnPlanClosing("mujhe ek sasta kurta chahiye");

  it("quotes the line it anchors the language on, and names no language", () => {
    // Recency plus concreteness: the sentence itself sits at the point of
    // generation, so there is nothing abstract left to go and find.
    expect(closing).toContain("mujhe ek sasta kurta chahiye");
    expect(closing).not.toMatch(/answer in english/i);
    expect(closing).toContain("never change language inside one reply");
  });

  it("names the move each kind of ask calls for", () => {
    expect(closing).toContain("propose_purchase");
    expect(closing).toContain("look_on_web");
    expect(closing).toContain("answer_shopper");
  });

  it("forbids a question stapled to an acting move", () => {
    expect(closing).toContain("the signature is their answer");
    expect(closing).toContain("not a question stapled to an action");
  });

  it("caps a runaway quoted line rather than growing the prompt with it", () => {
    const long = turnPlanClosing("x".repeat(2000));
    expect(long.length).toBeLessThan(2600);
  });
});
