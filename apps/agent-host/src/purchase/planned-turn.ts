import { buyThrough } from "./buy-step.js";
import type { PurchaseResult } from "./purchase-result.js";
import type { RunnerConfig, RunnerParts } from "./runner-parts.js";
import { nonPurchaseTurn } from "./turn-step.js";

/**
 * The model's move, and what the harness let follow from it.
 *
 * DECISION: the planner is asked once. The gates that stood here re-planned
 * a turn over its language or its length, and when the second answer
 * disagreed too they printed a shell sentence apologising for the model. A
 * sentence the model wrote is the model's; the language rule rides in the
 * prompt's closing as context, and the plan that comes back is the turn.
 */
export async function planned(
  parts: RunnerParts,
  config: RunnerConfig,
  base: PurchaseResult,
  lines: readonly string[],
  turn: {
    stated: readonly string[];
    replyLanguage: string | null;
    digest: string;
  },
): Promise<PurchaseResult> {
  const plan = await parts.planner.plan(lines, turn.replyLanguage, turn.digest);
  const answered = await nonPurchaseTurn(
    parts,
    base,
    plan,
    turn.stated,
    turn.replyLanguage,
  );
  return (
    answered ??
    (await buyThrough(parts, config, base, turn.stated, turn.replyLanguage))
  );
}
