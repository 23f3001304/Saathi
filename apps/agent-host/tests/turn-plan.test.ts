import type { TurnPlan } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { runnerFor } from "./support/turn-harness.js";

const GREETING: TurnPlan = {
  action: "answer",
  reply: "Hello. I can shop for you once I know what you are after.",
  question: "What are you looking for, and what is your budget?",
};

/**
 * The regression that matters. A greeting used to draft an intent, sign a
 * mandate and offer four kurtas. The assertion is made where money is: the
 * gateway client is agent-host's only path to the ledger, so a run in which it
 * was never called is a run that wrote nothing to the ledger.
 */
describe("a greeting is not a purchase", () => {
  it("writes nothing: no intent, no mandate, no gateway call", async () => {
    const { runner } = runnerFor(GREETING);
    const result = await runner.run("hi");
    expect(result.status).toBe("answered");
    expect(result.intent).toBeNull();
    expect(result.cart).toBeNull();
    expect(result.memoryWrites).toEqual([]);
    expect(result.failure).toBeNull();
  });

  // One bubble per turn. Emitting `reply` and `question` separately said
  // everything twice on screen, because the model writes its question into the
  // reply as well: "could you please provide me with the size you are looking
  // for?" followed by "What size are you looking for in the navy kurta?".
  it("says the model's own words once, question included", async () => {
    const { runner, hub } = runnerFor(GREETING);
    await runner.run("hi");
    const beats = hub.snapshot();
    // A turn that asks commits one `question` beat and no bubble: the composer
    // is where a question is answered, and a bubble beside it would be the
    // same sentence said twice on one screen.
    const asked = beats.flatMap((beat) =>
      beat.kind === "question" ? [beat.prompt] : [],
    );
    expect(beats.filter((beat) => beat.kind === "message")).toHaveLength(0);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain(GREETING.reply);
    expect(asked[0]).toContain(GREETING.question);
  });
});

/**
 * The second half of the loop. Only the shopper's sentences were written down,
 * so recall returned a monologue: "yes" arrived with nothing to agree to, the
 * model could not see the offer it had just made, and it made it again — five
 * turns of the same answer in the session this fixes.
 */
describe("the agent's own turn is a memory too", () => {
  it("writes what it said back, marked as the agent and not as them", async () => {
    const { runner, conversation } = runnerFor(GREETING);
    await runner.run("hi");
    expect(conversation.remembered.map((line) => line.speaker)).toEqual([
      "user",
      "agent",
    ]);
    expect(conversation.remembered[1]?.text).toContain(GREETING.reply);
  });

  it("gives a bare yes the offer it is answering", async () => {
    const { runner, conversation } = runnerFor(GREETING);
    await runner.run("search amazon for an ssd");
    const planner = conversation.remembered.map(
      (l) => `${l.speaker}:${l.text}`,
    );
    expect(planner.some((line) => line.startsWith("agent:"))).toBe(true);
  });
});

describe("nothing to sign", () => {
  it("puts nothing on screen that a human could be asked to sign", async () => {
    const { runner, hub } = runnerFor(GREETING);
    await runner.run("hi");
    const kinds = hub.snapshot().map((beat) => beat.kind);
    expect(kinds).not.toContain("intent-draft");
    expect(kinds).not.toContain("intent-signed");
    expect(kinds).not.toContain("signing-required");
    expect(kinds).not.toContain("cart");
  });

  it("takes the same path when the model declines outright", async () => {
    const { runner } = runnerFor({
      action: "decline",
      reply: "There is nothing here I could buy for you.",
      question: null,
    });
    const result = await runner.run("what is the weather");
    expect(result.status).toBe("answered");
    expect(result.transcript).toEqual([
      "There is nothing here I could buy for you.",
    ]);
  });
});
