import { expect, it, vi } from "vitest";

import {
  JUDGE_MIN_CONFIDENCE,
  JUDGE_TIMEOUT_MS,
  LlmContradictionJudge,
  type RuleContext,
} from "../src/index.js";

import { candidate, entryOf } from "./builders.js";
import {
  FixedClock,
  SilentLogger,
  USER_SIG,
  scriptedJudge,
  type JudgeReply,
} from "./fakes.js";
import { newStack } from "./harness.js";

function judgeFor(reply: JudgeReply): LlmContradictionJudge {
  return new LlmContradictionJudge(
    scriptedJudge(reply),
    new FixedClock(),
    new SilentLogger(),
  );
}

function contextFor(
  type: "preference" | "fact" | "procedure",
  tier: 0 | 1 | 2 | 3,
): RuleContext {
  return {
    candidate: candidate({ type, subject: "user", predicate: "style" }),
    grantedTier: tier,
    constraints: [entryOf({ subject: "user" })],
    supersedes: [],
  };
}

const SILENT = judgeFor({ kind: "reply", body: {} });
const CONTEXT = contextFor("preference", 1);

it("R6 applies to a P1 preference or procedure sharing a subject", () => {
  expect(SILENT.fallbackApplies(contextFor("preference", 1))).toBe(true);
  expect(SILENT.fallbackApplies(contextFor("procedure", 2))).toBe(true);
});

it("R6 never applies to a fact, a P0 write, or an unrelated subject", () => {
  expect(SILENT.fallbackApplies(contextFor("fact", 2))).toBe(false);
  expect(SILENT.fallbackApplies(contextFor("preference", 0))).toBe(false);
  expect(
    SILENT.fallbackApplies({
      ...CONTEXT,
      constraints: [entryOf({ subject: "other_user" })],
    }),
  ).toBe(false);
});

it("rejects on a contradiction the judge is confident about", async () => {
  const outcome = await judgeFor({
    kind: "reply",
    body: {
      contradicts: true,
      constraint_id: "mem_1",
      confidence: 0.92,
      reason: "widens the cap",
    },
  }).evaluate(CONTEXT);
  expect(outcome.outcome).toMatchObject({
    verdict: "reject",
    reasonCode: "LLM_JUDGE_CONTRADICTION",
  });
  expect(outcome.rule).toBe("R6.llm-judge");
});

it("passes only on a confident non-contradiction", async () => {
  const outcome = await judgeFor({
    kind: "reply",
    body: { contradicts: false, confidence: 0.95, reason: "" },
  }).evaluate(CONTEXT);
  expect(outcome.outcome.verdict).toBe("pass");
});

it("fails closed below the confidence floor", async () => {
  const outcome = await judgeFor({
    kind: "reply",
    body: { contradicts: false, confidence: JUDGE_MIN_CONFIDENCE - 0.1 },
  }).evaluate(CONTEXT);
  expect(outcome.outcome).toMatchObject({
    reasonCode: "LLM_JUDGE_UNAVAILABLE",
  });
});

it("fails closed on a transport error", async () => {
  const outcome = await judgeFor({
    kind: "throw",
    message: "ECONNRESET",
  }).evaluate(CONTEXT);
  expect(outcome.outcome).toMatchObject({
    reasonCode: "LLM_JUDGE_UNAVAILABLE",
  });
});

it("fails closed on an off-schema reply", async () => {
  const outcome = await judgeFor({
    kind: "reply",
    body: { contradicts: "maybe" },
  }).evaluate(CONTEXT);
  expect(outcome.outcome).toMatchObject({
    reasonCode: "LLM_JUDGE_UNAVAILABLE",
  });
});

it("fails closed on a timeout: one attempt, no retry", async () => {
  vi.useFakeTimers();
  try {
    const pending = judgeFor({ kind: "hang" }).evaluate(CONTEXT);
    await vi.advanceTimersByTimeAsync(JUDGE_TIMEOUT_MS);
    expect((await pending).outcome).toMatchObject({
      reasonCode: "LLM_JUDGE_UNAVAILABLE",
    });
  } finally {
    vi.useRealTimers();
  }
});

it("rejects an ambiguous preference inside the gate and ledgers the judge", async () => {
  const stack = newStack(
    judgeFor({
      kind: "reply",
      body: {
        contradicts: true,
        constraint_id: "mem_x",
        confidence: 0.88,
        reason: "the preference implies spending past the cap",
      },
    }),
  );
  await stack.gate.submit(
    candidate({
      type: "constraint",
      sourceChannel: "user_signed_mandate",
      sig: USER_SIG,
      subject: "user",
      predicate: "max_amount",
      content: { value: 200000 },
    }),
  );
  const result = await stack.gate.submit(
    candidate({ type: "preference", subject: "user", predicate: "style" }),
  );

  expect(result.status).toBe("rejected");
  expect(result.reasonCode).toBe("LLM_JUDGE_CONTRADICTION");
  expect(result.rule).toBe("R6.llm-judge");
  const event = stack.events
    .readFrom(1, 50)
    .findLast((row) => row.kind === "memory.write.rejected");
  expect(event?.payload["judge"]).toMatchObject({
    prompt_id: "contradiction-judge.v1",
    confidence: 0.88,
  });
});
