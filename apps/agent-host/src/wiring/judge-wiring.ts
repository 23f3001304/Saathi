import type { IntentDraftDefaults, ShelfView } from "@covenant/agents";
import type { PromptJudge } from "@covenant/domain";

import type { AgentHostConfig } from "../config.js";
import { PlanDraftJudge } from "../judge/plan-draft-judge.js";
import type { PendingDraft } from "../purchase/pending-draft.js";
import { StaticPromptJudge } from "../session/static-prompt-judge.js";

/** One day: long enough for a cool-off hold to outlive the conversation. */
const INTENT_TTL_SECONDS = 86_400;

/** The covenant's own denomination. `draftSchemaFor` makes it a literal, so a
 *  draft in any other currency is rejected before anything can be signed. */
export const COVENANT_CURRENCY = "INR";

export interface JudgeDeps {
  readonly config: AgentHostConfig;
  readonly shelf: ShelfView;
  readonly merchantIss: string;
  /** Where the planner's proposal waits for the sheet. */
  readonly pending: PendingDraft;
}

/**
 * The drafter's judge. Live, the draft is the planner's own proposal; the
 * schema still holds the operator's cap and the currency as literals.
 * Scripted, there is no model, and the script reads the sentence itself.
 */
export function wireJudge(deps: JudgeDeps): PromptJudge {
  const plan = {
    merchantIss: deps.merchantIss,
    capPaise: deps.config.capPaise,
    currency: COVENANT_CURRENCY,
  };
  return deps.config.mode === "live"
    ? new PlanDraftJudge(deps.pending, plan, deps.shelf)
    : new StaticPromptJudge(deps.shelf, plan);
}

/**
 * DECISION: `user_cart_confirmation_required` is drafted `false` and the
 * cool-off threshold is drafted above the demo's cap. Why: §6.5's supervised
 * path answers `approve` *plus* an outstanding draft, and a cool-off above
 * threshold parks the purchase, both correct behaviours and both leaving the
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
