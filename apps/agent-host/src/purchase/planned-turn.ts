import { buyThrough } from "./buy-step.js";
import { plannedTurn } from "./plan-gate.js";
import { LANGUAGE_SLIPPED } from "./language-gate.js";
import { anchorLine } from "./web-errand.js";
import type { PurchaseResult } from "./purchase-result.js";
import type { RunnerConfig, RunnerParts } from "./runner-parts.js";
import { nonPurchaseTurn } from "./turn-step.js";

/** The model's move, and what the harness let follow from it. */
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
  const { plan, slipped } = await plannedTurn(
    parts.planner,
    lines,
    turn.replyLanguage,
    anchorLine(turn.stated),
    parts.logger,
    turn.digest,
  );
  const answered = await nonPurchaseTurn(
    parts,
    base,
    plan,
    turn.stated,
    turn.replyLanguage,
  );
  const result =
    answered ??
    (await buyThrough(
      parts,
      config,
      base,
      turn.stated,
      turn.replyLanguage,
    ));
  if (slipped) noteSlip(parts);
  return result;
}


/** Said in the harness's own voice: the turn stands, the language was not
 *  the one they asked for, and pretending otherwise would be the lie. */
function noteSlip(parts: RunnerParts): void {
  parts.hub.emit({ kind: "message", text: LANGUAGE_SLIPPED, variant: "system" });
}
