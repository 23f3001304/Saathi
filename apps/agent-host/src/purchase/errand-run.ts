import type { ConversationResult } from "@covenant/agents";
import type { Logger } from "@covenant/domain";

import type { Deadline } from "./errand-deadline.js";
import { ERRAND_CEILING_MS, errandDeadline } from "./errand-deadline.js";
import type { ErrandEnd } from "./observed-block.js";
import { lastSentence } from "./prose.js";

/** A bounded conversation whose whole tool surface is the sandbox window. */
export interface WebErrand {
  converse(userMessage: string): Promise<ConversationResult>;
  /**
   * Abandon whatever this conversation was doing. Called when the errand ran
   * past its deadline or threw: the turn it was in the middle of is one nobody
   * awaited, and resuming it on the next question would append this errand's
   * unfinished half to somebody else's. Optional, so a test double need not
   * have one.
   */
  reset?(): Promise<void>;
}

export interface ErrandPrompts {
  readonly look: string;
  /** Built after the looking leg, and told how the errand ended: what the
   *  window was shown is only known once it has been shown it, and the clock
   *  is a fact the model has to be able to name. */
  readonly summarise: (ended: ErrandEnd) => string;
}

export interface ErrandRun {
  readonly result: ConversationResult;
  /** The composed answer: the summary turn's own prose, never the join. */
  readonly told: string;
  /** The errand ran past its wall clock. */
  readonly expired: boolean;
  readonly failure: string | null;
}

/** How long the sentence about an abandoned errand may take. Shorter than
 *  the errand's own ceiling: an afterword that hangs would be the stall it
 *  exists to explain. */
export const AFTERWORD_MS = 30_000;

const EMPTY: ConversationResult = {
  transcript: [],
  blocked: [],
  turns: 0,
  completed: false,
};

/**
 * Look, then say. Both legs run on the same conversation, so the summary turn
 * still has every page it read in front of it; what changed is only that the
 * sentence it commits is written after the reading rather than during it.
 *
 * Every leg is raced against one wall clock, because the class of failure
 * this belongs to keeps producing new members and a turn that cannot end is
 * the worst of them: `ChatService` queues behind it. An errand ends. What it
 * ends with is the model's sentence about what this host observed (§6.3),
 * or, when even that cannot be had, nothing.
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
    const ended = { expired: false, failure: null };
    const summary = await clock.guard(
      errand.converse(prompts.summarise(ended)),
    );
    const told = composed(summary, result);
    logger.debug("purchase.web_look.transcript", {
      turns: result.turns,
      looked: JSON.stringify(result.transcript),
      committed: told,
    });
    return { result, told, expired: false, failure: null };
  } catch (cause) {
    return await abandoned(errand, prompts, clock, cause, { logger, ceilingMs });
  } finally {
    clock.cancel();
  }
}

/**
 * A leg that ended without a sentence, and why. An expiry is not a failure to
 * report as one: nothing broke, the errand ran out of clock. Either way the
 * hung conversation is abandoned first, and a fresh one is asked for the one
 * sentence the shopper will read.
 */
async function abandoned(
  errand: WebErrand,
  prompts: ErrandPrompts,
  clock: Deadline,
  cause: unknown,
  parts: { logger: Logger; ceilingMs: number },
): Promise<ErrandRun> {
  const expired = clock.passed;
  const failure = expired
    ? null
    : cause instanceof Error
      ? cause.message
      : "unknown";
  if (expired) {
    parts.logger.warn("purchase.errand.expired", { after_ms: parts.ceilingMs });
  } else {
    parts.logger.warn("purchase.web_look.failed", { failure });
  }
  await errand.reset?.().catch(() => undefined);
  const told = await afterword(errand, prompts, { expired, failure }, parts);
  return { result: EMPTY, told, expired, failure };
}

/**
 * The closing sentence, prompt and all. The prompt is built by a caller's
 * closure that reads the window, and on a window that has just gone it can
 * throw: guarding only the turn would leave the build outside every catch,
 * and a throw there would escape `runErrand` itself. Nothing may: an errand
 * ends, and a build that fails ends it on silence.
 */
async function afterword(
  errand: WebErrand,
  prompts: ErrandPrompts,
  ended: ErrandEnd,
  parts: { logger: Logger; ceilingMs: number },
): Promise<string> {
  let prompt: string;
  try {
    prompt = prompts.summarise(ended);
  } catch (cause) {
    parts.logger.warn("purchase.errand.afterword_prompt_failed", {
      failure: cause instanceof Error ? cause.message : "unknown",
    });
    return "";
  }
  return await sayOnly(errand, prompt, Math.min(parts.ceilingMs, AFTERWORD_MS));
}

/**
 * One turn whose only output is a sentence. Bounded by its own clock and
 * silent on any failure: a caller that could get nothing else out of the
 * model gets `""`, and says nothing rather than something fixed.
 */
export async function sayOnly(
  errand: WebErrand,
  prompt: string,
  ceilingMs: number = AFTERWORD_MS,
): Promise<string> {
  const clock = errandDeadline(ceilingMs);
  try {
    const said = await clock.guard(errand.converse(prompt));
    return lastSentence(said.transcript);
  } catch {
    return "";
  } finally {
    clock.cancel();
  }
}

function composed(
  summary: ConversationResult,
  looked: ConversationResult,
): string {
  const said = lastSentence(summary.transcript);
  return said === "" ? lastSentence(looked.transcript) : said;
}
