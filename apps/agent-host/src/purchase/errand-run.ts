import type { ConversationResult } from "@covenant/agents";
import type { Logger } from "@covenant/domain";

import type { Deadline } from "./errand-deadline.js";
import { ERRAND_CEILING_MS, errandDeadline } from "./errand-deadline.js";
import { CORRECTIVE, obeys } from "./language-gate.js";
import { lastSentence } from "./prose.js";
import { anchorLine } from "./web-errand.js";

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
  /** The shopper's own half, for the check the commit has to pass. */
  readonly stated: readonly string[];
  readonly replyLanguage: string | null;
}

export interface ErrandRun {
  readonly result: ConversationResult;
  /** The composed answer — the summary turn's own prose, never the join. */
  readonly told: string;
  /** True when even the second attempt came back in a language nobody asked
   *  for. The answer still stands; the harness says so beside it. */
  readonly slipped: boolean;
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
    const gated = await gate(errand, prompts, composed(summary, result), {
      logger,
      clock,
    });
    logger.debug("purchase.web_look.transcript", {
      turns: result.turns,
      looked: JSON.stringify(result.transcript),
      committed: gated.told,
    });
    return { result, ...gated, expired: false, failure: null };
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
  const empty = { result: EMPTY, told: "", slipped: false };
  if (clock.passed) {
    parts.logger.warn("purchase.errand.expired", { after_ms: parts.ceilingMs });
    await errand.reset?.().catch(() => undefined);
    return { ...empty, expired: true, failure: null };
  }
  const failure = cause instanceof Error ? cause.message : "unknown";
  parts.logger.warn("purchase.web_look.failed", { failure });
  return { ...empty, expired: false, failure };
}

/**
 * One regeneration, exactly like a schema-invalid tool argument gets one. The
 * check is mechanical and one-directional (`language-gate.ts`); a reply that
 * passes is committed untouched and costs nothing.
 */
async function gate(
  errand: WebErrand,
  prompts: ErrandPrompts,
  told: string,
  parts: { logger: Logger; clock: Deadline },
): Promise<{ told: string; slipped: boolean }> {
  const anchor = anchorLine(prompts.stated);
  if (told === "" || obeys(told, prompts.replyLanguage, anchor)) {
    return { told, slipped: false };
  }
  parts.logger.warn("purchase.web_look.language", { attempt: 1 });
  const again = await parts.clock.guard(
    errand.converse(CORRECTIVE + prompts.summarise()),
  );
  const second = lastSentence(again.transcript);
  if (second !== "" && obeys(second, prompts.replyLanguage, anchor)) {
    return { told: second, slipped: false };
  }
  parts.logger.warn("purchase.web_look.language", { attempt: 2 });
  return { told: second === "" ? told : second, slipped: true };
}

function composed(
  summary: ConversationResult,
  looked: ConversationResult,
): string {
  const said = lastSentence(summary.transcript);
  return said === "" ? lastSentence(looked.transcript) : said;
}
