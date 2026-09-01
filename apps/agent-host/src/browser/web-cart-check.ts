import type { BrowserSession, CovenantBounds } from "@covenant/browser-drive";
import { CartCovenant } from "@covenant/browser-drive";

import type { WebResult } from "./web-result.js";
import { readingBody, UNBOUNDED, webFailure, webOk } from "./web-result.js";

/**
 * The cart total, checked against the *signed* intent's ceiling.
 *
 * The number on the page bounds nothing. It is a P0 reading of foreign markup,
 * and the only thing it is allowed to do is fail the check: over the ceiling,
 * the agent stops and the payment step is never opened. With no signed covenant
 * there is no ceiling to check against, and the honest answer is to refuse
 * rather than fall back on a configured default.
 */
export async function checkCartAgainst(
  session: BrowserSession,
  bounds: CovenantBounds | null,
): Promise<WebResult> {
  const reading = await session.review().inspect(session.page());
  if (bounds === null) {
    return webFailure("no_signed_intent", UNBOUNDED, readingBody(reading));
  }
  const verdict = new CartCovenant(bounds).check(reading);
  const opened = session.handoff().requestFinalReview(verdict);
  const body = {
    ...readingBody(reading),
    cap_paise: bounds.capPaise,
    cap_source: "signed_intent_mandate",
    outcome: verdict.outcome,
    payment_step_opened: opened.ok,
    human: verdict.human,
  };
  return verdict.assists
    ? webOk(body)
    : webFailure(verdict.outcome, verdict.human, body);
}
