import type { TraitClaim, TurnPlan } from "@covenant/agents";
import type { Logger } from "@covenant/domain";

/** `TraitMemory`, as the only thing this needs it to be. */
export interface TraitWriter {
  remember(trait: TraitClaim): Promise<boolean>;
}

/**
 * What the model heard about the person, written down one at a time.
 *
 * DECISION: the model proposes a trait and this writes it; neither of them
 * grants it a tier. `TraitMemory` claims P1 through `verified_api` and the
 * gateway's write gate decides what is granted — so a durable fact enters the
 * corpus under exactly the same rules as the sentence it was said in. Being
 * about the person rather than about the purchase makes a memory longer-lived,
 * never more trusted: it still cannot widen a bound, and the predicate a trait
 * may be filed under cannot even name one (`parseTrait`).
 *
 * A refused write is logged and the turn continues. The shopper asked to be
 * remembered, not to be blocked on being remembered.
 */
export async function recordTraits(
  writer: TraitWriter,
  plan: TurnPlan,
  logger: Logger,
): Promise<number> {
  const heard = plan.traits ?? [];
  let kept = 0;
  for (const trait of heard) {
    const written = await writer.remember(trait);
    if (written) {
      kept += 1;
      continue;
    }
    logger.warn("chat.trait.not_kept", { key: trait.key });
  }
  return kept;
}
