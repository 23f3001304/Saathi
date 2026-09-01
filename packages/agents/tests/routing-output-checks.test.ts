import { describe, expect, it } from "vitest";

import { COVENANT_TOOL_DECLARATIONS } from "../src/providers/tool-declarations.js";
import type { AgentToolRequest } from "../src/shared/agent-session.js";
import { scoreConfidence } from "../src/routing/confidence-score.js";
import {
  countHedges,
  readSelfRating,
  signalsOf,
} from "../src/routing/confidence-signals.js";
import {
  agreementOf,
  schemaOutcomeOf,
  toolArgsOutcomeOf,
} from "../src/routing/output-checks.js";

describe("text signals", () => {
  it("counts distinct hedge markers, not repetitions of one", () => {
    expect(countHedges("I think it seems fine")).toBe(2);
    expect(countHedges("The lamp costs 1200 paise.")).toBe(0);
  });

  it("reads the self-rating the structured output was asked for", () => {
    expect(readSelfRating('{"answer":"yes","confidence":0.42}')).toBe(0.42);
    expect(readSelfRating('{"confidence": 1.0}')).toBe(1);
    expect(readSelfRating('{"answer":"yes"}')).toBeNull();
  });

  it("treats an empty answer as a refusal rather than as certainty", () => {
    const signals = signalsOf({
      text: "   ",
      schema: "not_required",
      toolArgs: "not_required",
      agreement: null,
    });
    expect(signals.refused).toBe(true);
    expect(scoreConfidence(signals).value).toBe(0);
  });

  it("does not read silence as refusal when the answer was a tool call", () => {
    const signals = signalsOf({
      text: "",
      schema: "not_required",
      toolArgs: "all",
      agreement: null,
      decidesByTool: true,
    });
    expect(signals.refused).toBe(false);
    expect(scoreConfidence(signals).value).toBe(1);
  });
});

describe("structured output checks", () => {
  it("passes a bare object first try and a fenced one after repair", () => {
    expect(schemaOutcomeOf('{"a":1}', true)).toBe("first_try");
    expect(schemaOutcomeOf('Sure!\n```json\n{"a":1}\n```', true)).toBe(
      "after_repair",
    );
    expect(schemaOutcomeOf("no json here", true)).toBe("failed");
    expect(schemaOutcomeOf("no json here", false)).toBe("not_required");
  });
});

describe("tool argument checks", () => {
  const call = (args: Record<string, unknown>): AgentToolRequest => ({
    toolUseId: "call_1",
    tool: "catalog_search",
    server: "covenant_merchant",
    args,
  });

  it("passes a call carrying every required argument", () => {
    const good = call({
      envelope: "jws",
      query: "lamp",
      max_price_paise: null,
      limit: 5,
    });
    expect(toolArgsOutcomeOf([good], COVENANT_TOOL_DECLARATIONS)).toBe("all");
  });

  it("reports a partial batch as some and an empty-args batch as none", () => {
    const good = call({
      envelope: "jws",
      query: "lamp",
      max_price_paise: null,
      limit: 5,
    });
    const bad = call({});
    expect(toolArgsOutcomeOf([good, bad], COVENANT_TOOL_DECLARATIONS)).toBe(
      "some",
    );
    expect(toolArgsOutcomeOf([bad], COVENANT_TOOL_DECLARATIONS)).toBe("none");
  });
});

describe("calling nothing at all", () => {
  it("abstains where prose was a legitimate answer", () => {
    expect(toolArgsOutcomeOf([], COVENANT_TOOL_DECLARATIONS)).toBe(
      "not_required",
    );
  });

  it("fails where the turn's whole answer was meant to be a tool call", () => {
    expect(toolArgsOutcomeOf([], COVENANT_TOOL_DECLARATIONS, true)).toBe(
      "none",
    );
  });
});

describe("self-consistency", () => {
  it("scores identical samples 1 and disjoint ones 0", () => {
    expect(agreementOf("the lamp costs 1200", "the lamp costs 1200")).toBe(1);
    expect(agreementOf("brass lamp", "copper kettle")).toBe(0);
  });

  it("works on Devanagari the same way it works on Latin", () => {
    expect(agreementOf("दीपक की कीमत", "दीपक की कीमत")).toBe(1);
  });
});
