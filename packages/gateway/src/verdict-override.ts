import type {
  CheckId,
  NonceState,
  ReasonCode,
  TimedVerdict,
  ToPass,
} from "@covenant/domain";
import { fail, timed } from "@covenant/domain";
import { nonceToPass } from "@covenant/mandates";

import type { VerdictContext } from "./verdict-context.js";

/** Which seal a commit-phase constraint stamps (§5.2 a, d). */
const OWNER_OF: Partial<Record<ReasonCode, CheckId>> = {
  NONCE_BURNED: "nonce",
  STOCK_CONFLICT: "quote_match",
};

/**
 * A constraint violation in the commit phase is translated into the verdict the
 * presenter should have seen, on the seal that owns it — so the audit view
 * still shows eight seals and the one that broke, rather than an opaque 500.
 * The check *diagnosed*; the constraint *enforced*; the answer is the same
 * either way.
 */
export function overrideVerdict(
  verdicts: readonly TimedVerdict[],
  reasonCode: ReasonCode,
  context: VerdictContext,
  stored: NonceState | null,
): readonly TimedVerdict[] {
  const owner = OWNER_OF[reasonCode];
  if (owner === undefined) {
    return verdicts;
  }
  const replacement = fail(owner, reasonCode, toPassFor(reasonCode, context, stored));
  return verdicts.map((verdict) =>
    verdict.check === owner ? timed(replacement, verdict.ms) : verdict,
  );
}

function toPassFor(
  reasonCode: ReasonCode,
  context: VerdictContext,
  stored: NonceState | null,
): ToPass | null {
  if (reasonCode === "NONCE_BURNED") {
    return nonceToPass(stored);
  }
  const quote = context.cart.quote;
  return {
    sku_id: context.signedQuote?.sku_id ?? quote.quote_jti,
    reservation_id: quote.reservation_id,
    reserved_until: quote.reservation_expires_at,
    requote_tool: "merchant.quote",
    remedy: "request_new_quote",
  };
}
