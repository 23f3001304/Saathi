import type { TraitClaim, TurnPlan } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { amendmentBeat, amendmentOf } from "../src/judge/amendment-gate.js";
import { recordTraits } from "../src/judge/trait-gate.js";
import { RecordingLogger, SeqIds } from "./support/fakes.js";

function planOf(over: Partial<TurnPlan>): TurnPlan {
  return {
    action: "answer",
    reply: "",
    question: null,
    query: null,
    amendment: null,
    traits: [],
    ...over,
  };
}

const amendment = {
  summary: "Cap apparel at ₹3,000",
  changes: [
    {
      rule: "cap_paise",
      scope: "apparel",
      from: 500_000,
      to: 300_000,
      unit: "paise",
      currency: "INR",
      direction: "narrows" as const,
    },
  ],
};

describe("an amendment reaches the screen as a proposal", () => {
  it("is null on every move that is not one", () => {
    expect(amendmentOf(planOf({ action: "answer" }))).toBeNull();
    expect(amendmentOf(planOf({ action: "draft_intent" }))).toBeNull();
    expect(amendmentOf(planOf({ action: "propose_amendment" }))).toBeNull();
  });

  it("carries the computed direction and an id of its own", () => {
    const beat = amendmentBeat(
      planOf({ action: "propose_amendment", amendment }),
      new SeqIds(),
      new RecordingLogger(),
    );
    expect(beat?.widens).toBe(false);
    expect(beat?.changes[0]?.direction).toBe("narrows");
    expect(beat?.amendmentId.startsWith("urn:covenant:amendment:")).toBe(true);
  });
});

describe("a widening proposal", () => {
  it("is logged loudly, and is still only a proposal", () => {
    const logger = new RecordingLogger();
    const widening = {
      ...amendment,
      changes: [
        { ...amendment.changes[0]!, to: 900_000, direction: "widens" as const },
      ],
    };
    const beat = amendmentBeat(
      planOf({ action: "propose_amendment", amendment: widening }),
      new SeqIds(),
      logger,
    );
    expect(beat?.widens).toBe(true);
    expect(
      logger.lines.some(
        (line) =>
          line.level === "warn" &&
          line.evt === "covenant.amendment.proposed_widening",
      ),
    ).toBe(true);
  });
});

describe("a trait is written, never granted", () => {
  it("writes what the model heard and counts what the gate kept", async () => {
    const seen: TraitClaim[] = [];
    const kept = await recordTraits(
      {
        remember: async (trait) => {
          seen.push(trait);
          return trait.key !== "refused";
        },
      },
      planOf({
        traits: [
          { key: "shoe_size", value: "UK 8" },
          { key: "refused", value: "nope" },
        ],
      }),
      new RecordingLogger(),
    );
    expect(seen).toHaveLength(2);
    expect(kept).toBe(1);
  });

  it("writes nothing on a turn that heard nothing", async () => {
    const kept = await recordTraits(
      {
        remember: async () => {
          throw new Error("nothing should have been written");
        },
      },
      planOf({}),
      new RecordingLogger(),
    );
    expect(kept).toBe(0);
  });
});
