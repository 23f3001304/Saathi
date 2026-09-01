import type { MemoryEntry } from "@covenant/domain";
import { NumericRelaxationRule } from "@covenant/memory";
import type { MemoryWriteCandidate } from "@covenant/memory";
import { describe, expect, it } from "vitest";

import { parseTrait } from "../src/buyer/trait-claim.js";
import {
  ANSWER_TOOL,
  BUYER_TOOL_SERVER,
  REMEMBER_TOOL,
} from "../src/buyer/turn-plan.js";
import { TurnPlanCollector } from "../src/buyer/turn-plan-collector.js";
import { amend, change, planFrom, SIGNED_CAP_PAISE } from "./amendments.js";

function signedCap(): MemoryEntry {
  return {
    id: "mem_signed_cap",
    tenantId: "tnt_demo",
    userId: "usr_1",
    type: "constraint",
    tier: "P3",
    quarantined: false,
    subject: "user",
    predicate: "max_amount",
    content: { value: SIGNED_CAP_PAISE, unit: "paise", currency: "INR" },
    contentHash: "sha256:0",
    entryHash: "sha256:0",
    sourceChannel: "user_confirmation",
    sourceRef: null,
    tValid: "2026-01-01T00:00:00.000Z",
    tInvalid: null,
    tCreated: "2026-01-01T00:00:00.000Z",
    tExpired: null,
    supersededBy: null,
    writeEventId: "evt_1",
  } as MemoryEntry;
}

/** The same sentence, arriving the only way an unsigned instruction can. */
function typedInChat(toPaise: number): MemoryWriteCandidate {
  return {
    tenantId: "tnt_demo",
    userId: "usr_1",
    type: "preference",
    tierClaim: "P1",
    content: { value: toPaise, unit: "paise", currency: "INR" },
    sourceChannel: "verified_api",
    sourceRef: null,
    sig: null,
    subject: "user",
    predicate: "max_amount",
    tValid: "2026-08-31T00:00:00.000Z",
    tInvalid: null,
    requestId: null,
  };
}

describe("remembering a trait", () => {
  it("normalises the key so one fact stays one fact", () => {
    expect(parseTrait({ key: " Shoe Size ", value: "UK 8" })).toEqual({
      key: "shoe_size",
      value: "UK 8",
    });
  });

  it("refuses to file a trait under the name of a bound", () => {
    expect(parseTrait({ key: "max_amount", value: "900000" })).toBeNull();
  });

  it("rides alongside a move rather than replacing one", async () => {
    const collector = new TurnPlanCollector();
    await collector.dispatch({
      tool: REMEMBER_TOOL,
      server: BUYER_TOOL_SERVER,
      args: { key: "city", value: "Bengaluru" },
    });
    await collector.dispatch({
      tool: ANSWER_TOOL,
      server: BUYER_TOOL_SERVER,
      args: { reply: "Noted." },
    });
    const plan = collector.take();
    expect(plan?.action).toBe("answer");
    expect(plan?.traits).toEqual([{ key: "city", value: "Bengaluru" }]);
    expect(collector.take()).toBeNull();
  });
});

/**
 * The load-bearing test. "Raise my cap to ₹9,000" typed into the chat produces
 * a proposal and nothing else: the model's move carries no way to apply it,
 * and the same instruction routed through memory — the only path an unsigned
 * sentence has into the corpus — is refused by R1 for trying to widen a bound
 * it is not entitled to widen. The assertion is against the covenant, not the
 * prose: the signed ceiling still reads ₹2,000 afterwards.
 */
describe("an unsigned instruction cannot move a bound", () => {
  it("proposes, and leaves the signed ceiling where it was", async () => {
    const covenant = [signedCap()];
    const { plan } = await planFrom(
      new TurnPlanCollector(),
      amend([change({ from: SIGNED_CAP_PAISE, to: 900_000 })]),
    );
    expect(plan?.action).toBe("propose_amendment");
    expect(plan?.amendment?.changes[0]?.direction).toBe("widens");

    const context = {
      candidate: typedInChat(900_000),
      grantedTier: "P1" as const,
      constraints: covenant,
      supersedes: [],
    };
    const rule = new NumericRelaxationRule();
    expect(rule.appliesTo(context)).toBe(true);
    expect(rule.evaluate(context)).toEqual({
      verdict: "reject",
      reasonCode: "CONSTRAINT_RELAXATION_ATTEMPT",
      constraintId: "mem_signed_cap",
      attackId: null,
    });
    expect(covenant[0]?.content["value"]).toBe(SIGNED_CAP_PAISE);
  });
});
