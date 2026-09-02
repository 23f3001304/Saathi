import { buyThrough, reproposeSku } from "./buy-step.js";
import type { PurchaseResult } from "./purchase-result.js";
import { emptyResult } from "./purchase-result.js";
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
  // A pick of a platform sku rebuilds the standing cart under a pick run id,
  // exactly as a tap through `PurchaseRunner.repropose` does.
  const repropose = (ref: string): Promise<PurchaseResult | null> => {
    const under = emptyResult(`urn:covenant:pick:${ref}`, ref);
    return reproposeSku(parts, config, under, ref);
  };
  const answered = await nonPurchaseTurn(
    { ...parts, repropose },
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
