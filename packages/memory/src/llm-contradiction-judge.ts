import type {
  Clock,
  Logger,
  PromptJudge,
  ResponseSchema,
} from "@covenant/domain";

import type { RuleContext, RuleOutcome } from "./rules/contradiction-rule.js";
import { PASS, reject } from "./rules/contradiction-rule.js";

/** Sealed, versioned release artifact: `prompts/contradiction-judge.v1.md`. */
export const CONTRADICTION_PROMPT_ID = "contradiction-judge.v1";
export const JUDGE_TIMEOUT_MS = 2000;
export const JUDGE_MIN_CONFIDENCE = 0.7;
export const JUDGE_RULE_ID = "R6.llm-judge";

export interface JudgeVerdict {
  readonly contradicts: boolean;
  readonly constraintId: string | null;
  readonly confidence: number;
  readonly reason: string;
}

export interface JudgeOutcome {
  readonly outcome: RuleOutcome;
  readonly rule: string;
  /** Ledgered: the judge is auditable like every other decision (§9.5). */
  readonly telemetry: Readonly<Record<string, unknown>>;
}

const verdictSchema: ResponseSchema<JudgeVerdict> = (value) => {
  const raw = value as Record<string, unknown>;
  if (
    typeof raw?.["contradicts"] !== "boolean" ||
    typeof raw["confidence"] !== "number"
  ) {
    throw new TypeError("contradiction-judge: reply is off schema");
  }
  const id = raw["constraint_id"];
  return {
    contradicts: raw["contradicts"],
    constraintId: typeof id === "string" ? id : null,
    confidence: raw["confidence"],
    reason: typeof raw["reason"] === "string" ? raw["reason"] : "",
  };
};

/**
 * R6, reached **only** when every deterministic rule declined and the
 * candidate is genuinely ambiguous (§9.5). The rules are a one-way ratchet:
 * the judge may reject, never approve (decision 42) — an LLM that could
 * overturn a deterministic rejection would reintroduce exactly the attack
 * surface the write gate exists to remove. It runs at memory-write time, which
 * is why it is off the `verify-cart` latency path entirely.
 */
export class LlmContradictionJudge {
  constructor(
    private readonly judge: PromptJudge,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Never `constraint` (P3-only), `fact` (R1 covers it), `episode` or P0. */
  fallbackApplies(context: RuleContext): boolean {
    const { candidate, grantedTier, constraints } = context;
    if (candidate.type !== "preference" && candidate.type !== "procedure") {
      return false;
    }
    return grantedTier >= 1 && constraints.some((c) => shares(c, context));
  }

  async evaluate(context: RuleContext): Promise<JudgeOutcome> {
    const startedAt = this.clock.now().getTime();
    try {
      const verdict = await this.ask(context);
      return this.decide(verdict, this.clock.now().getTime() - startedAt);
    } catch (error) {
      return this.unavailable(error, this.clock.now().getTime() - startedAt);
    }
  }

  private async ask(context: RuleContext): Promise<JudgeVerdict> {
    // The candidate rides as a labelled data block, never as instructions.
    return await withTimeout(
      this.judge.judge(
        CONTRADICTION_PROMPT_ID,
        {
          candidate_data: JSON.stringify(context.candidate.content),
          candidate_subject: context.candidate.subject,
          candidate_predicate: context.candidate.predicate,
          constraints: context.constraints.map((entry) => ({
            id: entry.id,
            predicate: entry.predicate,
            content: entry.content,
          })),
        },
        verdictSchema,
        { timeoutMs: JUDGE_TIMEOUT_MS },
      ),
      JUDGE_TIMEOUT_MS,
    );
  }

  private decide(verdict: JudgeVerdict, latencyMs: number): JudgeOutcome {
    const telemetry = {
      prompt_id: CONTRADICTION_PROMPT_ID,
      latency_ms: latencyMs,
      confidence: verdict.confidence,
      contradicts: verdict.contradicts,
    };
    if (verdict.confidence < JUDGE_MIN_CONFIDENCE) {
      this.logger.warn("memory.judge.low_confidence", telemetry);
      return outcomeOf(reject("LLM_JUDGE_UNAVAILABLE"), telemetry);
    }
    if (!verdict.contradicts) {
      return outcomeOf(PASS, telemetry);
    }
    return outcomeOf(reject("LLM_JUDGE_CONTRADICTION", verdict.constraintId), {
      ...telemetry,
      reason: verdict.reason,
    });
  }

  /** Timeout, non-parse, transport error — all fail closed (§9.5). */
  private unavailable(error: unknown, latencyMs: number): JudgeOutcome {
    const telemetry = {
      prompt_id: CONTRADICTION_PROMPT_ID,
      latency_ms: latencyMs,
      error: error instanceof Error ? error.message : "unknown",
    };
    this.logger.warn("memory.judge.unavailable", telemetry);
    return outcomeOf(reject("LLM_JUDGE_UNAVAILABLE"), telemetry);
  }
}

function outcomeOf(
  outcome: RuleOutcome,
  telemetry: Readonly<Record<string, unknown>>,
): JudgeOutcome {
  return { outcome, rule: JUDGE_RULE_ID, telemetry };
}

/** "at least one live constraint shares the candidate's subject or category". */
function shares(
  constraint: { readonly subject: string | null; readonly content: unknown },
  context: RuleContext,
): boolean {
  const { subject, content } = context.candidate;
  if (subject !== null && constraint.subject === subject) {
    return true;
  }
  const category = (content as Record<string, unknown>)["category"];
  const held = (constraint.content as Record<string, unknown>)["category"];
  return typeof category === "string" && category === held;
}

/** One attempt, no retry: a slow judge must not hold a write transaction open. */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, rejectAfter) => {
    timer = setTimeout(
      () =>
        rejectAfter(new Error(`contradiction-judge: timed out after ${ms}ms`)),
      ms,
    );
    timer.unref?.();
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    clearTimeout(timer);
  }
}
