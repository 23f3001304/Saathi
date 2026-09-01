import type {
  AgentSession,
  IntentDraftDefaults,
  ShelfView,
} from "@covenant/agents";
import type { Logger, PromptJudge } from "@covenant/domain";

import type { AgentHostConfig } from "../config.js";
import { SessionPromptJudge } from "../judge/session-prompt-judge.js";
import { StaticPromptJudge } from "../judge/static-prompt-judge.js";

/** One day: long enough for a cool-off hold to outlive the conversation. */
const INTENT_TTL_SECONDS = 86_400;

/** The covenant's own denomination. `draftSchemaFor` makes it a literal, so a
 *  draft in any other currency is rejected before anything can be signed. */
export const COVENANT_CURRENCY = "INR";

export interface JudgeDeps {
  readonly config: AgentHostConfig;
  readonly shelf: ShelfView;
  readonly merchantIss: string;
  readonly session: AgentSession;
  readonly logger: Logger;
}

/**
 * The drafter's judge. In live mode the model says what the bounds are and the
 * schema decides whether they are admissible; the deterministic drafter is the
 * floor it falls back to, and that floor is *narrower* than anything the model
 * can propose, so falling back can only ever tighten the user's covenant.
 */
export function wireJudge(deps: JudgeDeps): PromptJudge {
  const fallback = new StaticPromptJudge(deps.shelf, {
    merchantIss: deps.merchantIss,
    capPaise: deps.config.capPaise,
    currency: COVENANT_CURRENCY,
  });
  return deps.config.mode === "live"
    ? new SessionPromptJudge(
        deps.session,
        fallback,
        deps.logger,
        deps.merchantIss,
        deps.shelf,
      )
    : fallback;
}

/**
 * DECISION: `user_cart_confirmation_required` is drafted `false` and the
 * cool-off threshold is drafted above the demo's cap. Why: §6.5's supervised
 * path answers `approve` *plus* an outstanding draft, and a cool-off above
 * threshold parks the purchase — both are correct behaviours and both leave the
 * demo with no terminal payment to show. The hold-to-sign gates are still real
 * (`ConfirmationGate`); what is relaxed is the gateway's second, redundant
 * confirmation, not the user's signature.
 */
export function draftDefaults(config: AgentHostConfig): IntentDraftDefaults {
  return {
    currency: COVENANT_CURRENCY,
    maxAmountPaise: config.capPaise,
    ttlSeconds: INTENT_TTL_SECONDS,
    cooloff: { threshold_paise: config.capPaise * 4, hold_seconds: 86_400 },
    creditPolicy: { allow_credit: false, max_apr_bps: 0 },
    humanPresent: true,
    userCartConfirmationRequired: false,
    shareAggregates: false,
    judgeTimeoutMs: config.timeoutMs,
  };
}
