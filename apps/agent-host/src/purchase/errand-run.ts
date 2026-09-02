import type { ConversationResult } from "@covenant/agents";
import type { Logger } from "@covenant/domain";

import type { Deadline } from "./errand-deadline.js";
import { ERRAND_CEILING_MS, errandDeadline } from "./errand-deadline.js";
import { lastSentence } from "./prose.js";

/** A bounded conversation whose whole tool surface is the sandbox window. */
export interface WebErrand {
  converse(userMessage: string): Promise<ConversationResult>;
  /**
   * Abandon whatever this conversation was doing. Called only when the errand
   * ran past its deadline: the turn it was in the middle of is one nobody
   * awaited, and resuming it on the next question would append this errand's
   * unfinished half to somebody else's. Optional, so a test double need not
   * have one.
   */
  reset?(): Promise<void>;
}

export interface ErrandPrompts {
  readonly look: string;
  /** Built after the looking leg, not before it: what the window was shown is
   *  only known once it has been shown it. */
  readonly summarise: () => string;
}

export interface ErrandRun {
  readonly result: ConversationResult;
  /** The composed answer — the summary turn's own prose, never the join. */
  readonly told: string;
  /** The errand ran past its wall clock. There is no sentence from it; the
   *  turn closes on the harness's own words and whatever was captured. */
  readonly expired: boolean;
  readonly failure: string | null;
}

const EMPTY: ConversationResult = {
  transcript: [],
  blocked: [],
  turns: 0,
  completed: false,
};

/**
 * Look, then say. Both legs run on the same conversation, so the summary turn
 * still has every page it read in front of it — what changed is only that the
 * sentence it commits is written after the reading rather than during it.
 *
 * Every leg is raced against one wall clock. Not because any particular leg is
 * known to hang, but because the class of failure this belongs to keeps
 * producing new members — a crashed renderer, a pipe nobody reads, a CDP
 * command with no answer — and a turn that cannot end is the worst of them all:
 * `ChatService` queues behind it, so the shopper cannot even ask something
 * else. An errand ends. What it ends with is decided by what was captured.
 */
export async function runErrand(
  errand: WebErrand,
  prompts: ErrandPrompts,
  logger: Logger,
  ceilingMs: number = ERRAND_CEILING_MS,
): Promise<ErrandRun> {
  const clock = errandDeadline(ceilingMs);
  try {
    // One errand, one conversation. See `WebErrand.reset`.
    await errand.reset?.();
    const result = await clock.guard(errand.converse(prompts.look));
    const summary = await clock.guard(errand.converse(prompts.summarise()));
    const told = composed(summary, result);
    logger.debug("purchase.web_look.transcript", {
      turns: result.turns,
      looked: JSON.stringify(result.transcript),
      committed: told,
    });
    return { result, told, expired: false, failure: null };
  } catch (cause) {
    return await abandoned(errand, clock, cause, { logger, ceilingMs });
  } finally {
    clock.cancel();
  }
}

/** A turn that ended without a sentence, and why. An expiry is not a failure
 *  to report as one: nothing broke, the errand simply ran out of clock. */
async function abandoned(
  errand: WebErrand,
  clock: Deadline,
  cause: unknown,
  parts: { logger: Logger; ceilingMs: number },
): Promise<ErrandRun> {
  const empty = { result: EMPTY, told: "" };
  if (clock.passed) {
    parts.logger.warn("purchase.errand.expired", { after_ms: parts.ceilingMs });
    await errand.reset?.().catch(() => undefined);
    return { ...empty, expired: true, failure: null };
  }
  const failure = cause instanceof Error ? cause.message : "unknown";
  parts.logger.warn("purchase.web_look.failed", { failure });
  return { ...empty, expired: false, failure };
}

function composed(
  summary: ConversationResult,
  looked: ConversationResult,
): string {
  const said = lastSentence(summary.transcript);
  return said === "" ? lastSentence(looked.transcript) : said;
}
