import type { WriteOutcome } from "../flow/memory.js";
import type { VerdictReply } from "../flow/verdict.js";
import type { FalsePositiveCost } from "./types.js";

/**
 * Stage 1 runs before the rule chain, so a rejection it owns carries no rule
 * id. Naming it here keeps the attribution column honest: "no rule fired" and
 * "the channel resolver refused" are different facts about the same 200.
 */
const STAGE_ONE: readonly string[] = [
  "TIER_CLAIM_EXCEEDS_CHANNEL",
  "SIGNATURE_INVALID",
  "SIGNER_UNKNOWN",
];

export function memoryDetector(result: WriteOutcome): string | null {
  if (result.rule !== null) {
    return result.rule;
  }
  if (result.reasonCode !== null && STAGE_ONE.includes(result.reasonCode)) {
    return "stage1.channel-tier";
  }
  return result.reasonCode === null ? null : "stage?.unattributed";
}

export function purchaseDetector(verdict: VerdictReply): string | null {
  if (verdict.httpStatus !== 200) {
    return "stage0.transport";
  }
  const broken = verdict.seals.find((seal) => seal.outcome !== "pass");
  if (broken !== undefined) {
    return broken.check;
  }
  return verdict.decision === "reject" ? "stage0.mandate-chain" : null;
}

function remedyIn(toPass: unknown): string | null {
  if (typeof toPass !== "object" || toPass === null) {
    return null;
  }
  const remedy = (toPass as Record<string, unknown>)["remedy"];
  return typeof remedy === "string" ? remedy : null;
}

export function remedyOf(toPass: unknown): string | null {
  return remedyIn(toPass);
}

const COST_BY_REMEDY: Readonly<Record<string, FalsePositiveCost>> = {
  renegotiate: "recoverable: re-quote",
  request_new_quote: "recoverable: re-quote",
  "re-derive_digest": "recoverable: re-quote",
  reissue_cart_mandate_with_new_jti: "recoverable: merchant re-signs",
  upgrade_extension_uri: "recoverable: merchant re-signs",
  obtain_signed_attestation: "recoverable: merchant re-signs",
  reissue_intent: "recoverable: user re-signs the covenant",
  reduce_cart_or_reissue_intent: "recoverable: user re-signs the covenant",
  reissue_intent_with_later_expiry: "recoverable: user re-signs the covenant",
  wait_or_reduce: "recoverable: wait or reduce",
  wait_or_cancel: "recoverable: wait or reduce",
  retry_with_new_idempotency_key: "recoverable: re-quote",
};

const USER_CHANNELS: readonly string[] = ["user_signed_mandate", "user_confirmation"];

/**
 * The cost is read off the channel, not off the reason code, because the
 * remedy the gateway offers is only a remedy if a *higher* channel exists.
 *
 * - untrusted text: the belief is dropped, the purchase is untouched, and the
 *   read gate would have kept that entry out of cart construction anyway.
 * - a signed channel refused by R4: P2 is a merchant's ceiling and P3 is the
 *   user's, so `obtain_signed_attestation` names a door that is already open.
 *   That is a dead end, and the report says so.
 */
export function memoryCost(
  result: WriteOutcome,
  channel: string,
): FalsePositiveCost {
  if (USER_CHANNELS.includes(channel)) {
    return "hard dead end";
  }
  if (result.reasonCode === "AUTHORITY_CLAIM_IN_UNTRUSTED_CHANNEL" && channel !== "untrusted_text") {
    return "hard dead end";
  }
  if (channel === "untrusted_text") {
    return "degraded: belief dropped, purchase unaffected";
  }
  const remedy = remedyOf(result.reply.body["to_pass"]);
  const mapped = remedy === null ? undefined : COST_BY_REMEDY[remedy];
  return mapped ?? "degraded: belief dropped, purchase unaffected";
}

export function purchaseCost(verdict: VerdictReply): FalsePositiveCost {
  const remedy = remedyOf(verdict.toPass);
  return (remedy === null ? undefined : COST_BY_REMEDY[remedy]) ?? "hard dead end";
}
