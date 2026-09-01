import { describe, expect, it } from "vitest";

import { KAnonymizer, MIN_K } from "../src/index.js";
import { ScriptedRandom } from "./fakes.js";

describe("KAnonymizer.gate", () => {
  const CASES: readonly (readonly [string, boolean, number, boolean, boolean])[] = [
    ["consent + enough contributors: allowed", true, MIN_K, true, false],
    ["consent but below k: suppressed, not allowed", true, MIN_K - 1, false, true],
    ["no consent, even with plenty of contributors: not allowed", false, 500, false, false],
    ["no consent and below k: not allowed, and reported suppressed", false, 1, false, true],
    ["exactly k contributors is enough", true, MIN_K, true, false],
  ];

  it.each(CASES)("%s", (_name, consented, contributors, allowed, suppressed) => {
    const gate = new KAnonymizer(new ScriptedRandom([0.5])).gate(consented, contributors);
    expect(gate.allowed).toBe(allowed);
    expect(gate.suppressed).toBe(suppressed);
    expect(gate.k).toBe(contributors);
  });
});

describe("KAnonymizer.noisedCount", () => {
  it("never returns a negative count", () => {
    const anonymizer = new KAnonymizer(new ScriptedRandom([0.999]));
    expect(anonymizer.noisedCount(0)).toBeGreaterThanOrEqual(0);
  });

  it("draws zero noise at the uniform midpoint", () => {
    const anonymizer = new KAnonymizer(new ScriptedRandom([0.5]));
    expect(anonymizer.noisedCount(42)).toBe(42);
  });

  it("is deterministic for a fixed random draw", () => {
    const first = new KAnonymizer(new ScriptedRandom([0.9])).noisedCount(10, 2);
    const second = new KAnonymizer(new ScriptedRandom([0.9])).noisedCount(10, 2);
    expect(first).toBe(second);
  });
});
