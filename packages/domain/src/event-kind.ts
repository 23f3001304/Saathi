/**
 * The dotted event-kind catalog (§10.3). It is the audit UI's own vocabulary
 * (frontend-screens §4.2) extended with the gateway-internal kinds the UI
 * renders as neutral pulli — there is no translation layer anywhere, and a
 * kind not in this list cannot be appended.
 */
export const EVENT_KINDS = [
  "intent.drafted",
  "intent.signed",
  "intent.amended",
  "user.confirmed",
  "memory.write.committed",
  "memory.write.superseded",
  "memory.write.shadowed",
  "memory.write.rejected",
  "memory.invalidated",
  "memory.retrieved",
  "catalog.read",
  "catalog.quote.received",
  "merchant.floor.set",
  "merchant.floor.cleared",
  "negotiation.settled",
  "cart.assembled",
  "cart.digest.computed",
  "mandate.issued",
  "mandate.expired",
  "nonce.burned",
  "idempotency.conflict",
  "verdict.emitted",
  "envelope.reserved",
  "envelope.captured",
  "envelope.released",
  "stock.reservation.claimed",
  "stock.reservation.confirmed",
  "stock.reservation.released",
  "stock.conflict",
  "txn.opened",
  "txn.cancelled",
  "cooloff.parked",
  "cooloff.cancelled",
  "cooloff.released",
  "cooloff.race.lost",
  "rzp.order.created",
  "rzp.link.created",
  "rzp.polled",
  "payment.captured",
  "payment.failed",
  "payment.parked",
  "refund.requested",
  "refund.honored",
  "regret.recorded",
  "tool.call.allowed",
  "tool.call.blocked",
  "attack.detected",
  "fold.materialized",
  "replay.verified",
  "reconciliation.ok",
  "reconciliation.drift",
  "webhook.rejected",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

/**
 * The subset the audit UI declares (§10.3 "UI-declared", frontend §4.2).
 * Anything else renders as a neutral pulli with its raw kind string — the
 * instrument never silently drops a ledger event.
 */
export const UI_EVENT_KINDS: readonly EventKind[] = [
  "intent.drafted",
  "intent.signed",
  "intent.amended",
  "memory.write.committed",
  "memory.write.rejected",
  "memory.retrieved",
  "catalog.quote.received",
  "cart.assembled",
  "cart.digest.computed",
  "mandate.issued",
  "verdict.emitted",
  "cooloff.parked",
  "cooloff.cancelled",
  "cooloff.released",
  "rzp.order.created",
  "rzp.link.created",
  "rzp.polled",
  "payment.captured",
  "payment.failed",
  "attack.detected",
  "fold.materialized",
  "replay.verified",
];

export function isEventKind(value: string): value is EventKind {
  return (EVENT_KINDS as readonly string[]).includes(value);
}

/** Underscore spelling, adopted from the UI so the projection is a copy (§4.11). */
export const EVENT_ACTORS = [
  "user",
  "buyer_agent",
  "merchant_agent",
  "gateway",
  "razorpay",
  "system",
  "attacker",
] as const;

export type EventActor = (typeof EVENT_ACTORS)[number];

/**
 * `attack.detected` covers only blocks that are **not** already visible as a
 * `memory.write.rejected` or a failing `verdict.emitted` (§4.11, decision 24).
 * `nonce_replay` is the one case the design ledgers twice on purpose: a burned
 * mandate re-presented under a *different* idempotency key is both a policy
 * rejection and an attack (§4.5 row 4, §5.2 a).
 */
export const ATTACK_DETECTED_SOURCES = [
  "pre_tool_use",
  "webhook_signature",
  "ledger_fork",
  "tenant_mismatch",
  "nonce_replay",
] as const;

export type AttackDetectedSource = (typeof ATTACK_DETECTED_SOURCES)[number];
