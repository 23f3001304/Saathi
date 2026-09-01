import { expect, it } from "vitest";

import type { RuleContext } from "../src/index.js";

import { candidate } from "./builders.js";
import { RULE_CASES, type RuleCase } from "./rule-cases.js";

// The five deterministic rules of §9.1, one positive and one negative case
// each: widening a bound is the attack, narrowing it is a user tightening
// their own covenant.

function contextFor(testCase: RuleCase): RuleContext {
  return {
    candidate: candidate({
      predicate: testCase.predicate,
      subject: "user",
      content: testCase.content,
    }),
    grantedTier: testCase.tier,
    constraints: testCase.constraints,
    supersedes: [],
  };
}

it.each(RULE_CASES)("$name", (testCase: RuleCase) => {
  const context = contextFor(testCase);
  const outcome = testCase.rule.appliesTo(context)
    ? testCase.rule.evaluate(context)
    : { verdict: "pass" as const };
  if (testCase.expected === null) {
    expect(outcome.verdict).toBe("pass");
    return;
  }
  expect(outcome).toMatchObject({
    verdict: "reject",
    reasonCode: testCase.expected,
  });
});
