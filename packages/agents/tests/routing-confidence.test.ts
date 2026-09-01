import { describe, expect, it } from "vitest";

import {
  CONFIDENCE_WEIGHTS,
  DEFAULT_CONFIDENCE_THRESHOLD,
  scoreConfidence,
} from "../src/routing/confidence-score.js";
import type { ConfidenceSignals } from "../src/routing/confidence-signals.js";

const CERTAIN: ConfidenceSignals = {
  schema: "first_try",
  toolArgs: "all",
  hedges: 0,
  refused: false,
  selfRated: 1,
  agreement: 1,
};

function componentNamed(signals: ConfidenceSignals, name: string) {
  return scoreConfidence(signals).components.find(
    (component) => component.name === name,
  );
}

describe("confidence weights", () => {
  it("sums to one across all five named signals", () => {
    const total = Object.values(CONFIDENCE_WEIGHTS).reduce(
      (sum, weight) => sum + weight,
      0,
    );
    expect(total).toBeCloseTo(1, 10);
  });

  it("scores a fully certain answer at 1 and a fully failed one at 0", () => {
    expect(scoreConfidence(CERTAIN).value).toBeCloseTo(1, 10);
    expect(
      scoreConfidence({
        schema: "failed",
        toolArgs: "none",
        hedges: 9,
        refused: true,
        selfRated: 0,
        agreement: 0,
      }).value,
    ).toBe(0);
  });
});

describe("signal components", () => {
  it("drops the signals a turn cannot produce and renormalises the rest", () => {
    const chat: ConfidenceSignals = {
      ...CERTAIN,
      schema: "not_required",
      toolArgs: "not_required",
      selfRated: null,
      agreement: null,
    };
    const score = scoreConfidence(chat);
    expect(score.components.map((part) => part.name)).toEqual([
      "languageCertainty",
    ]);
    expect(score.value).toBeCloseTo(1, 10);
  });

  it("scores a repaired schema below a first-try one, above a failed one", () => {
    const first = scoreConfidence({ ...CERTAIN, schema: "first_try" }).value;
    const repair = scoreConfidence({
      ...CERTAIN,
      schema: "after_repair",
    }).value;
    const failed = scoreConfidence({ ...CERTAIN, schema: "failed" }).value;
    expect(first).toBeGreaterThan(repair);
    expect(repair).toBeGreaterThan(failed);
  });
});

describe("language certainty", () => {
  it("saturates hedging, so a fourth hedge cannot push certainty below zero", () => {
    expect(
      componentNamed({ ...CERTAIN, hedges: 3 }, "languageCertainty")?.value,
    ).toBe(0);
    expect(
      componentNamed({ ...CERTAIN, hedges: 9 }, "languageCertainty")?.value,
    ).toBe(0);
  });

  it("zeroes language certainty on a refusal however fluent it was", () => {
    expect(
      componentNamed(
        { ...CERTAIN, hedges: 0, refused: true },
        "languageCertainty",
      )?.value,
    ).toBe(0);
  });

  it("carries every component's weight into the record", () => {
    const parts = scoreConfidence(CERTAIN).components;
    expect(parts.find((part) => part.name === "schemaValidation")?.weight).toBe(
      CONFIDENCE_WEIGHTS.schemaValidation,
    );
    expect(parts).toHaveLength(5);
  });
});

describe("threshold", () => {
  it("sits between a hedged prose answer and a clean one", () => {
    const hedged = scoreConfidence({
      schema: "not_required",
      toolArgs: "not_required",
      hedges: 2,
      refused: false,
      selfRated: null,
      agreement: null,
    });
    expect(hedged.value).toBeLessThan(DEFAULT_CONFIDENCE_THRESHOLD);
    expect(scoreConfidence(CERTAIN).value).toBeGreaterThan(
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
  });

  /** Validated JSON and in-bounds tool arguments outweigh hedgy prose on
   *  purpose: the machine-checkable signals are the ones we actually trust. */
  it("keeps a hedged but fully validated answer above the threshold", () => {
    expect(
      scoreConfidence({ ...CERTAIN, hedges: 3, selfRated: 0.3 }).value,
    ).toBeGreaterThan(DEFAULT_CONFIDENCE_THRESHOLD);
  });
});
